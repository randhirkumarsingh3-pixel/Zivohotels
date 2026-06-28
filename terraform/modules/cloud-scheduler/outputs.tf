output "job_ids" {
  description = "The IDs of the created jobs"
  value = {
    for k, v in google_cloud_scheduler_job.jobs : k => v.id
  }
}
