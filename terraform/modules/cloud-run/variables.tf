variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "image" {
  description = "Docker image URL"
  type        = string
}

variable "is_public" {
  description = "Whether the service should allow unauthenticated access"
  type        = bool
  default     = false
}

variable "cpu" {
  description = "CPU allocation (e.g., '1000m' or '1' for 1 vCPU)"
  type        = string
  default     = "1000m"
}

variable "memory" {
  description = "Memory allocation (e.g., '512Mi')"
  type        = string
  default     = "512Mi"
}

variable "concurrency" {
  description = "Maximum number of concurrent requests per container"
  type        = number
  default     = 80
}

variable "timeout_seconds" {
  description = "Max timeout for requests"
  type        = number
  default     = 300
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "env_vars" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Environment variables that reference Secret Manager secrets. Map of env_var_name => secret_name"
  type        = map(string)
  default     = {}
}

variable "vpc_connector" {
  description = "VPC connector ID for private resources (Cloud SQL)"
  type        = string
  default     = null
}

variable "command" {
  description = "Optional command to override Docker entrypoint (e.g., for workers)"
  type        = list(string)
  default     = []
}

variable "args" {
  description = "Optional args to pass to the command"
  type        = list(string)
  default     = []
}
