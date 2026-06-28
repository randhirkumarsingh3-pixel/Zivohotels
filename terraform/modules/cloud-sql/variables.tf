variable "project_id" {
  description = "The ID of the GCP Project"
  type        = string
}

variable "region" {
  description = "The default GCP region for resources"
  type        = string
}

variable "environments" {
  description = "List of environments to create databases for"
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}

variable "vpc_id" {
  description = "The ID of the VPC network to connect the database to"
  type        = string
}

variable "private_vpc_connection" {
  description = "Dependency on private VPC connection to ensure it exists before DB creation"
  type        = string
}
