-- Zed Open: a droplet that opens folders in Zed, reusing the window that
-- already has the folder open. Build with `make droplet`; the logic lives in
-- Contents/Resources/zed-open.sh (droplet/zed-open.sh in the repo).

on open theItems
	set args to ""
	repeat with f in theItems
		set args to args & " " & quoted form of (POSIX path of f)
	end repeat
	runHelper(args)
end open

on run
	runHelper("")
end run

on runHelper(args)
	set helper to (POSIX path of (path to me)) & "Contents/Resources/zed-open.sh"
	try
		do shell script quoted form of helper & args
	on error errMsg
		display notification errMsg with title "Zed Open"
	end try
end runHelper
