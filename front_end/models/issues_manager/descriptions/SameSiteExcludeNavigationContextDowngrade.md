# Migrate entirely to HTTPS to have cookies sent on same-site requests

A cookie wasn’t sent to {PLACEHOLDER_destination} origin from {PLACEHOLDER_origin} context on a navigation.
Because this cookie would have been sent across schemes on the same site, it wasn’t sent.
This behavior enhances the `SameSite` attribute’s protection of user data from request forgery by network attackers.

Resolve this issue by migrating your site (as defined by the eTLD+1) entirely to HTTPS.
It’s also recommended to mark the cookie with the `Secure` attribute if that isn’t already the case.
