output "instance_connection_names" {
  description = "The connection names of the created instances (project:region:instance)"
  value = {
    for k, v in google_sql_database_instance.instances : k => v.connection_name
  }
}

output "private_ip_addresses" {
  description = "The private IP addresses of the instances"
  value = {
    for k, v in google_sql_database_instance.instances : k => v.private_ip_address
  }
}
