package ro.uvt.info.dw

import com.datastax.spark.connector.{SomeColumns, _}
import com.datastax.spark.connector.cql.CassandraConnector
import org.apache.spark.{SparkConf, SparkContext}
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.cassandra._

/**
 * Use Case C – Moving Average Aggregation
 *
 * Reads the latest close price per business_date for a given asset,
 * computes 7-day and 30-day simple moving averages, and writes the
 * results to the `moving_averages` table.
 *
 * spark-submit --class ro.uvt.info.dw.MovingAverage ... \
 *   financial_dw "QDL/BITFINEX/BTCUSD" "NASDAQ-DATA-LINK.QDL/BITFINEX"
 */
object MovingAverage {

  case class MARow(
    asset_id:       String,
    data_source_id: String,
    business_date:  String,
    close_price:    Double,
    sma7:           Option[Double],
    sma30:          Option[Double],
  )

  def main(args: Array[String]): Unit = {
    val keyspace     = if (args.length > 0) args(0) else "financial_dw"
    val assetId      = if (args.length > 1) args(1) else "QDL/BITFINEX/BTCUSD"
    val dataSourceId = if (args.length > 2) args(2) else "NASDAQ-DATA-LINK.QDL/BITFINEX"

    val conf = new SparkConf()
      .setAppName("DW – Moving Average")
      .set("spark.cassandra.connection.host", sys.env.getOrElse("CASSANDRA_HOSTS", "localhost"))
      .set("spark.cassandra.connection.port", sys.env.getOrElse("CASSANDRA_PORT", "9042"))

    val sc = new SparkContext(conf)
    sc.setLogLevel("WARN")

    ensureTable(sc, keyspace)

    import org.apache.spark.sql.SparkSession
    val spark = SparkSession.builder().config(conf).getOrCreate()
    import spark.implicits._

    val df = spark.read
      .cassandraFormat("data", keyspace)
      .load()
      .filter($"asset_id" === assetId && $"data_source_id" === dataSourceId)
      .selectExpr(
        "asset_id", "data_source_id",
        "CAST(business_date AS STRING) AS business_date",
        "values_double['close'] AS close_price"
      )
      .filter($"close_price".isNotNull)
      .orderBy("business_date")

    val rows = df.as[(String, String, String, Double)].collect()

    val results = rows.zipWithIndex.map { case ((aid, dsid, bdate, close), i) =>
      val sma7  = if (i >= 6)  Some(rows.slice(i - 6,  i + 1).map(_._4).sum / 7.0)  else None
      val sma30 = if (i >= 29) Some(rows.slice(i - 29, i + 1).map(_._4).sum / 30.0) else None
      MARow(aid, dsid, bdate, close, sma7, sma30)
    }

    sc.parallelize(results)
      .map(r => (r.asset_id, r.data_source_id, r.business_date, r.close_price,
                 r.sma7.getOrElse(0.0), r.sma30.getOrElse(0.0),
                 r.sma7.isDefined, r.sma30.isDefined))
      .saveToCassandra(keyspace, "moving_averages",
        SomeColumns("asset_id", "data_source_id", "business_date", "close_price",
                    "sma7", "sma30", "sma7_valid", "sma30_valid"))

    println(s"MovingAverage finished. ${results.length} rows written to $keyspace.moving_averages")
    sc.stop()
  }

  private def ensureTable(sc: SparkContext, keyspace: String): Unit = {
    CassandraConnector(sc.getConf).withSessionDo { session =>
      session.execute(
        s"""CREATE TABLE IF NOT EXISTS $keyspace.moving_averages (
           |  asset_id        TEXT,
           |  data_source_id  TEXT,
           |  business_date   TEXT,
           |  close_price     DOUBLE,
           |  sma7            DOUBLE,
           |  sma7_valid      BOOLEAN,
           |  sma30           DOUBLE,
           |  sma30_valid     BOOLEAN,
           |  PRIMARY KEY ((asset_id, data_source_id), business_date)
           |) WITH CLUSTERING ORDER BY (business_date ASC)""".stripMargin
      )
    }
  }
}
