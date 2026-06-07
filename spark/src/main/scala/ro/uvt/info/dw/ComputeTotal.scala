package ro.uvt.info.dw

import com.datastax.spark.connector.{SomeColumns, _}
import com.datastax.spark.connector.cql.CassandraConnector
import org.apache.spark.{SparkConf, SparkContext}

/**
 * Use Case A – Simple Aggregation
 *
 * Reads time-series records from the `data` table, groups them by
 * (asset_id, business_date_year), counts data points per year-bucket,
 * and persists the results back into the `totals` table.
 *
 * Run with spark-submit:
 *   spark-submit --class ro.uvt.info.dw.ComputeTotal \
 *     --master local[*] \
 *     --conf spark.cassandra.connection.host=localhost \
 *     financial-dw-spark-assembly-1.0.0.jar \
 *     <keyspace> [data_source_id_filter]
 */
object ComputeTotal {

  def main(args: Array[String]): Unit = {
    val keyspace = if (args.nonEmpty) args(0) else "financial_dw"
    // Optional filter: only aggregate records from this data source
    val dataSourceFilter = if (args.length > 1) Some(args(1)) else None

    val conf = new SparkConf()
      .setAppName("DW – Compute Total")
      .set("spark.cassandra.connection.host", sys.env.getOrElse("CASSANDRA_HOSTS", "localhost"))
      .set("spark.cassandra.connection.port", sys.env.getOrElse("CASSANDRA_PORT", "9042"))

    val sc = new SparkContext(conf)
    sc.setLogLevel("WARN")

    ensureTotalsTable(sc, keyspace)

    val rdd = sc.cassandraTable(keyspace, "data")
      .select("asset_id", "data_source_id", "business_date_year", "business_date", "system_date")

    val filtered = dataSourceFilter match {
      case Some(dsId) => rdd.filter(_.getString("data_source_id") == dsId)
      case None       => rdd
    }

    filtered
      .keyBy(row => (row.getString("asset_id"), row.getInt("business_date_year")))
      .mapValues(_ => 1)
      .reduceByKey(_ + _)
      .map { case ((assetId, year), cnt) => (assetId, year, cnt) }
      .saveToCassandra(keyspace, "totals", SomeColumns("asset_id", "business_date_year", "cnt"))

    println(s"ComputeTotal finished. Results in $keyspace.totals")
    sc.stop()
  }

  private def ensureTotalsTable(sc: SparkContext, keyspace: String): Unit = {
    CassandraConnector(sc.getConf).withSessionDo { session =>
      session.execute(
        s"""CREATE TABLE IF NOT EXISTS $keyspace.totals (
           |  asset_id           TEXT,
           |  business_date_year INT,
           |  cnt                INT,
           |  PRIMARY KEY (asset_id, business_date_year)
           |)""".stripMargin
      )
    }
  }
}
