package ro.uvt.info.dw

import com.datastax.spark.connector.{SomeColumns, _}
import com.datastax.spark.connector.cql.CassandraConnector
import org.apache.spark.{SparkConf, SparkContext}
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.cassandra._
import org.apache.spark.sql.functions._

/**
 * Use Case D – Risk Metrics
 *
 * Computes daily return, rolling 30-day volatility (std of returns),
 * and a simple risk signal (HIGH / MEDIUM / LOW) based on whether
 * the current day's volatility exceeds 2× or 1× the period average.
 *
 * Results are written to `risk_metrics`.
 *
 * spark-submit --class ro.uvt.info.dw.RiskMetrics ... \
 *   financial_dw "QDL/BITFINEX/BTCUSD" "NASDAQ-DATA-LINK.QDL/BITFINEX"
 */
object RiskMetrics {

  def main(args: Array[String]): Unit = {
    val keyspace     = if (args.length > 0) args(0) else "financial_dw"
    val assetId      = if (args.length > 1) args(1) else "QDL/BITFINEX/BTCUSD"
    val dataSourceId = if (args.length > 2) args(2) else "NASDAQ-DATA-LINK.QDL/BITFINEX"

    val spark = SparkSession.builder()
      .appName("DW – Risk Metrics")
      .config("spark.cassandra.connection.host", sys.env.getOrElse("CASSANDRA_HOSTS", "localhost"))
      .config("spark.cassandra.connection.port", sys.env.getOrElse("CASSANDRA_PORT", "9042"))
      .getOrCreate()

    spark.sparkContext.setLogLevel("WARN")
    import spark.implicits._

    ensureTable(spark.sparkContext, keyspace)

    val raw = spark.read
      .cassandraFormat("data", keyspace)
      .load()
      .filter($"asset_id" === assetId && $"data_source_id" === dataSourceId)
      .selectExpr(
        "asset_id", "data_source_id",
        "CAST(business_date AS STRING) AS business_date",
        "values_double['close'] AS close"
      )
      .filter($"close".isNotNull)
      .orderBy("business_date")

    // Compute daily returns using lag window
    import org.apache.spark.sql.expressions.Window
    val w = Window.partitionBy("asset_id", "data_source_id").orderBy("business_date")

    val withReturns = raw
      .withColumn("prev_close", lag("close", 1).over(w))
      .withColumn("daily_return",
        when($"prev_close".isNotNull && $"prev_close" =!= 0.0,
          ($"close" - $"prev_close") / $"prev_close"
        ).otherwise(lit(null).cast("double"))
      )

    // 30-day rolling volatility (std of returns)
    val w30 = Window.partitionBy("asset_id", "data_source_id")
      .orderBy("business_date")
      .rowsBetween(-29, 0)

    val withVol = withReturns
      .withColumn("volatility_30d", stddev("daily_return").over(w30))

    // Risk signal
    val avgVol = withVol.agg(avg("volatility_30d")).first().getDouble(0)
    val withSignal = withVol.withColumn("risk_signal",
      when($"volatility_30d" > avgVol * 2.0, lit("HIGH"))
        .when($"volatility_30d" > avgVol * 1.0, lit("MEDIUM"))
        .otherwise(lit("LOW"))
    )

    withSignal
      .select("asset_id", "data_source_id", "business_date",
              "close", "daily_return", "volatility_30d", "risk_signal")
      .na.fill(Map("risk_signal" -> "LOW"))
      .write
      .mode(org.apache.spark.sql.SaveMode.Append)
      .cassandraFormat("risk_metrics", keyspace)
      .save()

    println(s"RiskMetrics finished for $assetId. Results in $keyspace.risk_metrics")
    spark.stop()
  }

  private def ensureTable(sc: SparkContext, keyspace: String): Unit = {
    CassandraConnector(sc.getConf).withSessionDo { session =>
      session.execute(
        s"""CREATE TABLE IF NOT EXISTS $keyspace.risk_metrics (
           |  asset_id        TEXT,
           |  data_source_id  TEXT,
           |  business_date   TEXT,
           |  close           DOUBLE,
           |  daily_return    DOUBLE,
           |  volatility_30d  DOUBLE,
           |  risk_signal     TEXT,
           |  PRIMARY KEY ((asset_id, data_source_id), business_date)
           |) WITH CLUSTERING ORDER BY (business_date ASC)""".stripMargin
      )
    }
  }
}
