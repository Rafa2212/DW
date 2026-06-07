name := "financial-dw-spark"
version := "1.0.0"
scalaVersion := "2.12.18"

val sparkVersion = "3.5.0"
val cassandraConnectorVersion = "3.5.0"

libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-core"   % sparkVersion % "provided",
  "org.apache.spark" %% "spark-sql"    % sparkVersion % "provided",
  "org.apache.spark" %% "spark-mllib"  % sparkVersion % "provided",
  "com.datastax.spark" %% "spark-cassandra-connector" % cassandraConnectorVersion,
)

// Merge strategy to avoid META-INF conflicts when building a fat JAR
assembly / assemblyMergeStrategy := {
  case PathList("META-INF", _*) => MergeStrategy.discard
  case _                        => MergeStrategy.first
}

// Do not include Spark JARs in the fat JAR (they are provided by the cluster)
// Exclude spark-* and hadoop-* but NOT the cassandra connector (spark-cassandra-connector)
assembly / assemblyExcludedJars := {
  val cp = (assembly / fullClasspath).value
  cp.filter { f =>
    val n = f.data.getName
    val isSpark  = n.startsWith("spark-") && !n.startsWith("spark-cassandra")
    val isHadoop = n.startsWith("hadoop-")
    val isScala  = n.startsWith("scala-library")
    isSpark || isHadoop || isScala
  }
}
