# Listen on the local milter port that Postfix's smtpd_milters points at.
milter = yes;
timeout = 120s;
upstream "local" {
  default = yes;
  self_scan = yes;
}
count = 4;
max_retries = 5;
discard_on_reject = false;
quarantine_on_reject = false;
bind_socket = "127.0.0.1:11332";
