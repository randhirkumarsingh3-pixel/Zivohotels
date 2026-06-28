variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "api_id" {
  description = "The ID of the API"
  type        = string
  default     = "zivohotels-api"
}

variable "openapi_config" {
  description = "Base64 encoded OpenAPI spec content"
  type        = string
}

variable "gateway_id" {
  description = "The ID of the Gateway"
  type        = string
  default     = "zivohotels-gateway"
}
