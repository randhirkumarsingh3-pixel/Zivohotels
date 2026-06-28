# Custom VPC Network
resource "google_compute_network" "main_vpc" {
  name                    = "zivohotels-vpc"
  auto_create_subnetworks = false
}

# Subnet for general resources
resource "google_compute_subnetwork" "main_subnet" {
  name          = "zivohotels-subnet-${var.region}"
  ip_cidr_range = "10.0.0.0/20"
  region        = var.region
  network       = google_compute_network.main_vpc.id
}

# Subnet dedicated for Serverless VPC Access (Cloud Run connecting to VPC)
resource "google_compute_subnetwork" "serverless_subnet" {
  name          = "zivohotels-serverless-subnet"
  ip_cidr_range = "10.1.0.0/28"
  region        = var.region
  network       = google_compute_network.main_vpc.id
}

# Serverless VPC Access Connector
resource "google_vpc_access_connector" "main_connector" {
  name          = "zivohotels-vpc-conn"
  region        = var.region
  
  subnet {
    name = google_compute_subnetwork.serverless_subnet.name
  }
  
  # Limits for scaling the connector
  min_instances = 2
  max_instances = 10
}

# Setup private IP addressing for Cloud SQL to use
resource "google_compute_global_address" "private_ip_address" {
  name          = "zivohotels-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main_vpc.id
}

# Create a private connection so Cloud SQL can exist inside this VPC
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}
