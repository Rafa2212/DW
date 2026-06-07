package ro.uvt.info.dw

import com.datastax.spark.connector.cql.CassandraConnector
import org.apache.spark.SparkContext
import org.apache.spark.ml.feature.{Normalizer, VectorAssembler}
import org.apache.spark.ml.regression.LinearRegression
import org.apache.spark.sql.{SaveMode, SparkSession}
import org.apache.spark.sql.cassandra._

/**
 * Use Case B – Machine Learning Prediction (Linear Regression)
 *
 * Reads OHLC time-series data from the `data` table for a chosen asset,
 * trains a linear regression model to predict the Open price from
 * (Close, Low, High, timestamp), evaluates on a test split, and
 * writes predictions back into `regression_results`.
 *
 * Run with spark-submit:
 *   spark-submit --class ro.uvt.info.dw.Regression \
 *     --master local[*] \
 *     --conf spark.cassandra.connection.host=localhost \
 *     financial-dw-spark-assembly-1.0.0.jar \
 *     <keyspace> <asset_id> <data_source_id>
 *
 * Example:
 *   financial-dw-spark-assembly-1.0.0.jar \
 *     financial_dw QDL/BITFINEX/BTCUSD "NASDAQ-DATA-LINK.QDL/BITFINEX"
 */
object Regression {

  def main(args: Array[String]): Unit = {
    val keyspace    = if (args.length > 0) args(0) else "financial_dw"
    val assetId     = if (args.length > 1) args(1) else "QDL/BITFINEX/BTCUSD"
    val dataSourceId = if (args.length > 2) args(2) else "NASDAQ-DATA-LINK.QDL/BITFINEX"

    val session = SparkSession.builder()
      .appName("DW – Linear Regression")
      .config("spark.cassandra.connection.host",
              sys.env.getOrElse("CASSANDRA_HOSTS", "localhost"))
      .config("spark.cassandra.connection.port",
              sys.env.getOrElse("CASSANDRA_PORT", "9042"))
      .getOrCreate()

    session.sparkContext.setLogLevel("WARN")

    ensureOutputTables(session.sparkContext, keyspace)

    // ----------------------------------------------------------------
    // 1+2. Load data for the target asset and build a price DataFrame.
    //      Auto-detects column names (BITFINEX uses last/mid, Yahoo uses close/open).
    // ----------------------------------------------------------------
    val allData = session.read
      .cassandraFormat("data", keyspace)
      .load()
      .filter(s"data_source_id = '$dataSourceId' AND asset_id = '$assetId'")
      .createOrReplaceTempView("spark_data")

    // Detect which price column exists by checking a sample row
    val sample = session.sql(
      "SELECT values_double FROM spark_data LIMIT 1"
    ).collect()

    if (sample.isEmpty) {
      println(s"No data found for asset=$assetId, source=$dataSourceId. Exiting.")
      session.stop()
      return
    }

    val keys = sample(0).getMap[String, Double](0).keySet
    val targetCol  = Seq("close", "last", "mid", "open").find(keys.contains).getOrElse("last")
    val feature1   = Seq("high", "open", "mid").find(keys.contains).getOrElse(targetCol)
    val feature2   = Seq("low", "bid").find(keys.contains).getOrElse(targetCol)
    val feature3   = Seq("mid", "close", "last").find(keys.contains).getOrElse(targetCol)

    println(s"Using target=$targetCol, features=[$feature1, $feature2, $feature3]")

    val df = session.sql(
      s"""
         |SELECT
         |  values_double['$targetCol'] AS open,
         |  values_double['$feature1']  AS close,
         |  values_double['$feature2']  AS low,
         |  values_double['$feature3']  AS high,
         |  unix_timestamp(CAST(business_date AS TIMESTAMP)) AS seconds,
         |  business_date AS bdate
         |FROM spark_data
         |WHERE values_double['$targetCol'] IS NOT NULL
         |""".stripMargin
    ).na.drop()

    if (df.isEmpty) {
      println(s"No OHLC data found for asset=$assetId, source=$dataSourceId. Exiting.")
      session.stop()
      return
    }

    // ----------------------------------------------------------------
    // 3. Persist training data back to the warehouse
    // ----------------------------------------------------------------
    df.write
      .mode(SaveMode.Append)
      .cassandraFormat("regression_data", keyspace)
      .save()

    // ----------------------------------------------------------------
    // 4. Feature engineering: assemble and normalise features
    // ----------------------------------------------------------------
    val assembled = new VectorAssembler()
      .setInputCols(Array("seconds", "close", "low", "high"))
      .setOutputCol("features")
      .transform(df)

    val normalised = new Normalizer()
      .setInputCol("features")
      .setOutputCol("normFeatures")
      .setP(2.0)
      .transform(assembled)

    // ----------------------------------------------------------------
    // 5. Train / test split and Linear Regression
    // ----------------------------------------------------------------
    val Array(train, test) = normalised.randomSplit(Array(0.7, 0.3), seed = 42L)

    val lr = new LinearRegression()
      .setLabelCol("open")
      .setFeaturesCol("normFeatures")
      .setMaxIter(10)
      .setRegParam(0.1)
      .setElasticNetParam(0.5)

    val model = lr.fit(train)
    println(s"RMSE on test: ${model.summary.rootMeanSquaredError}")
    println(s"R²   on test: ${model.summary.r2}")

    // ----------------------------------------------------------------
    // 6. Write predictions back to the warehouse
    // ----------------------------------------------------------------
    model.transform(test)
      .select("seconds", "open", "prediction")
      .write
      .mode(SaveMode.Append)
      .cassandraFormat("regression_results", keyspace)
      .save()

    println(s"Regression finished. Results in $keyspace.regression_results")
    session.stop()
  }

  private def ensureOutputTables(sc: SparkContext, keyspace: String): Unit = {
    CassandraConnector(sc.getConf).withSessionDo { session =>
      session.execute(
        s"""CREATE TABLE IF NOT EXISTS $keyspace.regression_data (
           |  bdate   DATE PRIMARY KEY,
           |  seconds BIGINT,
           |  open    DOUBLE,
           |  close   DOUBLE,
           |  low     DOUBLE,
           |  high    DOUBLE
           |)""".stripMargin
      )
      session.execute(
        s"""CREATE TABLE IF NOT EXISTS $keyspace.regression_results (
           |  seconds    BIGINT PRIMARY KEY,
           |  open       DOUBLE,
           |  prediction DOUBLE
           |)""".stripMargin
      )
    }
  }
}
