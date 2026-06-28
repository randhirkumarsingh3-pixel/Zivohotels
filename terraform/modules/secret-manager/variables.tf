variable "project_id" {
  description = "The ID of the GCP Project"
  type        = string
}

variable "environments" {
  description = "List of environments to create secrets for"
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}

variable "secret_names" {
  description = "List of base secret names to create (e.g. DATABASE_URL)"
  type        = list(string)
  default = [
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "OTP_EXPIRY_MINUTES"
  ]
}
