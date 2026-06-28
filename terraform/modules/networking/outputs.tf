output "vpc_id" {
  description = "The ID of the main VPC network"
  value       = google_compute_network.main_vpc.id
}

output "vpc_self_link" {
  description = "The self link of the main VPC network"
  value       = google_compute_network.main_vpc.self_link
}

output "vpc_connector_name" {
  description = "The fully qualified name of the Serverless VPC Access connector"
  value       = google_vpc_access_connector.main_connector.id
}

output "private_vpc_connection" {
  description = "Dependency to ensure the private connection exists before creating Cloud SQL"
  value       = google_service_networking_connection.private_vpc_connection.id
}
