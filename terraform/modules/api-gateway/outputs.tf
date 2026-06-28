output "gateway_url" {
  description = "The default hostname of the Gateway"
  value       = google_api_gateway_gateway.gateway.default_hostname
}

output "gateway_id" {
  description = "The ID of the Gateway"
  value       = google_api_gateway_gateway.gateway.id
}
