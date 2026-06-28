variable "project_id" {
  description = "The ID of the GCP Project"
  type        = string
}

variable "region" {
  description = "The default GCP region for resources"
  type        = string
  default     = "asia-south1" # Mumbai
}

variable "github_repo" {
  description = "The GitHub repository format 'owner/repo' for Workload Identity"
  type        = string
}
