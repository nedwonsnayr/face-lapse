# Person profiles — security/data integrity review

Profiles are collections under one trusted owner's existing Cloudflare login, not separate access identities. Owner retains access to every profile. Person ids are validated on API entry. Per-photo endpoints and mixed batches verify membership before modification. Bulk dismissal, duplicate checks and date interpolation cannot mix profiles.

Export cache lookup includes profile identity; job polling checks ownership. Other-person output filenames retain person id after registry restart; legacy unprefixed outputs belong to Ryan. File serving retains traversal protection. Photo paths remain internal globally numbered values; user-controlled person names never enter storage paths.

Frontend uses an immutable bound API context, keyed workspace, independent ETag maps and guarded stale list responses. Switching stops webcam streams, including late permission results. Export completion after switching cannot initiate a download in another workspace. Names rendered as text. Server validates name lengths and birthday calendar values. No new auth mechanism, dependency or secret.

Integration tests cover reads and writes across person scopes, mixed batch rejection, separate choices on the same photo, downloads/jobs and migration preservation. No blocking findings in reviewed scope. Existing single active export admission remains global to keep CPU use bounded.
