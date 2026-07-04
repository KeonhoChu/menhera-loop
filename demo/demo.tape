# Records demo/demo.gif for the README.
# Usage: vhs demo/demo.tape   (run from the repo root; requires `brew install vhs`)
Output demo/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1280
Set Height 640
Set Padding 24
Set Theme "Catppuccin Mocha"

Hide
Type "clear && node demo/demo.mjs"
Enter
Show

Sleep 18s
Screenshot demo/frame.png
Sleep 2s
