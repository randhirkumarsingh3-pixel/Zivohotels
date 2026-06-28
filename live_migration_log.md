# ZivoHotels Live Migration Log (Sprint 6)

*Maintain this log during the maintenance window to record the exact timestamp of each critical step. If a rollback is triggered, this artifact will be invaluable for the post-mortem.*

| Time (Local) | Event | Status / Notes |
| :--- | :--- | :--- |
| __:__ | **Code Freeze Begins** | 🔒 Maintenance window opened |
| __:__ | Production DB Snapshot Created | |
| __:__ | Snapshot Uploaded to GCS | |
| __:__ | Cloud SQL Import Completed | |
| __:__ | Media Migration Completed | |
| __:__ | `verifyMigration.js` Passed | |
| __:__ | BAT Smoke Tests Passed | |
| __:__ | DNS & API Gateway Switched | |
| __:__ | Real-time Monitoring Green | |
| __:__ | **Migration Declared Successful** | 🚀 |

## Rollback Triggers (If necessary)
- *Did login fail for > 15m?* [ ] Yes / [ ] No
- *Is the booking flow broken?* [ ] Yes / [ ] No
- *Is there a DB integrity mismatch?* [ ] Yes / [ ] No

*If any trigger is YES, immediately execute the Rollback section of the Migration Command Book.*
