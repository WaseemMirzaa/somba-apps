# Off camera: sign in as the demo customer when the sign-in screen is showing.
opt type key:login-email "customer@somba.app" 10
opt type key:login-password "{{DEMO_PASSWORD}}" 10
opt tap msg:sign_in
until icon:person_rounded 40
