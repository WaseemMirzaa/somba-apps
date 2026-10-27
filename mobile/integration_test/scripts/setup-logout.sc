# Off camera: make sure the sign-in screen is showing (signs out when a session was restored).
if icon:person_rounded tap icon:person_rounded
if icon:person_rounded scroll 700
if icon:person_rounded tap "msg:logout#0"
if "msg:logout#last" tap "msg:logout#last"
until key:login-email 20
