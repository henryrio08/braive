# iPhone voice and generation follow-up — November 3, 2026

Physical iPhone 14 feedback after the first xtool installation:

- Settings → Listen to voice made no sound and gave no visible response. Settings can open before capture configures an audio session. The preview now activates an audible playback session when capture is off and reports playback setup errors in Settings. The owner confirmed that the preview is now audible.
- The voice picker then proved hard to scroll, and its selected row sometimes played a different voice. The session was publishing an unchanged listening status and connection string 20 times a second, while Settings also refreshed its voice list on system notifications. The picker now keeps its voice list stable until Settings closes; unchanged status values no longer trigger redraws, and preview uses the voice selected in that visible list.
- Scene preparation showed “The request timed out” well before the ten-minute generation ceiling. The app's individual job poll used a 35-second network timeout and treated a transient timeout as the end of generation. It now retries the same job after transient connection errors until the existing ten-minute deadline; it does not submit another paid job. The backend's ten-minute ceiling is unchanged. End-to-end provider timing needs a live backend test.
- Speech felt unacknowledged for about five seconds. The headset now shows hearing/processing feedback from the on-device detector and partial transcription, and the quiet interval after stable speech is shorter (0.35 seconds for short commands, 0.9 seconds otherwise). Actual recognition latency and turn boundaries need a phone listening check.

The initial voice update compiled with xtool on Windows and was installed on the paired iPhone. The picker correction and a live scene still need a device check.
