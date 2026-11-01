# Off camera: sign in as Jean when the sign-in screen is showing.
if key:rider-email type key:rider-email "rider@somba.app" 10
if key:rider-email type key:rider-password "{{DEMO_PASSWORD}}" 10
if key:rider-signin tap key:rider-signin 0.5
until key:conn-status 40
