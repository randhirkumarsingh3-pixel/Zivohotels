output "bucket_names" {
  description = "The names of the created media buckets"
  value = {
    for k, v in google_storage_bucket.media_buckets : k => v.name
  }
}

output "bucket_urls" {
  description = "The URLs of the created media buckets"
  value = {
    for k, v in google_storage_bucket.media_buckets : k => v.url
  }
}
