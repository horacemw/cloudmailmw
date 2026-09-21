# Controller UI + API is bound to localhost only. Nginx reverse-proxies the
# admin UI on demand; never expose 11334 publicly.
bind_socket = "127.0.0.1:11334";
password    = "REPLACED_BY_DEPLOY";        # rspamadm pw hash goes here
