import SwiftUI

@main struct BraiveApp: App {
  @StateObject var session = Session()
  @Environment(\.scenePhase) var lifecycle
  var body: some Scene {
    WindowGroup {
      ContentView(s: session).preferredColorScheme(.dark).onChange(of: lifecycle) { _, value in
        UIApplication.shared.isIdleTimerDisabled = value == .active
        session.pause("app_inactive", enabled: value != .active)
      }
    }
  }
}
struct ContentView: View {
  @ObservedObject var s: Session
  @State var typed = ""
  @State var settings = false
  @State var confirmDelete = false
  @AppStorage("viewerIPD") var ipd = 64.0
  @AppStorage("viewerK1") var k1 = 0.0
  @AppStorage("viewerK2") var k2 = 0.0
  @AppStorage("viewerFOV") var fov = 70.0
  var body: some View {
    GeometryReader { geo in
      ZStack {
        StereoWorld(world: s.world).ignoresSafeArea().blur(
          radius: s.phase == .reveal ? max(0, (1 - s.reveal) * 7) : 0)
        if [.setup, .intro, .planning, .error].contains(s.phase) || s.loading {
          Color.black.opacity(s.phase == .intro ? 1 : 0.78).ignoresSafeArea()
        }
        if s.phase == .reveal { Color.black.opacity(max(0, 1 - s.reveal)).ignoresSafeArea() }
        if s.phase == .setup {
          setup.padding(24).frame(maxWidth: 560)
        } else {
          HStack(spacing: 0) {
            eyeHUD.frame(width: geo.size.width / 2)
            eyeHUD.frame(width: geo.size.width / 2)
          }
        }
        if !s.pauses.isEmpty {
          Color.black.opacity(0.88).ignoresSafeArea()
          HStack(spacing: 0) {
            pauseHUD.frame(width: geo.size.width / 2)
            pauseHUD.frame(width: geo.size.width / 2)
          }
        }
        VStack {
          HStack {
            Text("BRAIVE").font(.caption.weight(.bold)).tracking(5)
            Spacer()
            Button("Settings") { settings = true }
            Button("Exit") { s.finish(early: true) }
          }.padding()
          Spacer()
        }.opacity(s.phase == .setup ? 0 : 0.6).allowsHitTesting(s.phase != .setup)
      }
    }.sheet(isPresented: $settings) { settingsView }.onAppear {
      UIApplication.shared.isIdleTimerDisabled = true
      applyViewer()
    }
  }
  var setup: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("B R A I V E").font(.caption).foregroundStyle(.mint)
        Text("Practice the\nuncomfortable.").font(
          .system(size: 38, weight: .medium, design: .serif))
        Text("Describe a situation. Step into a generated world. Find your next small step.")
          .foregroundStyle(.secondary)
        TextField("Mac backend URL", text: $s.server).textInputAutocapitalization(.never)
          .autocorrectionDisabled().textFieldStyle(.roundedBorder)
        SecureField("Pairing token", text: $s.token).textFieldStyle(.roundedBorder)
        Toggle(
          "I agree to send speech and session context to Meta for processing.",
          isOn: $s.remoteConsent)
        Toggle("Enable live generation and voice services", isOn: $s.liveEnabled)
        Button("Connect & enter forest") { s.connect() }.buttonStyle(.borderedProminent).tint(.mint)
          .disabled(!s.remoteConsent || !s.liveEnabled)
        Button("Preview forest offline") { s.preview() }.buttonStyle(.bordered)
        Text(s.message).font(.caption).foregroundStyle(.secondary)
        Text(
          "Use seated or standing still. Situational practice; no treatment claims. Remove the viewer or use Exit whenever needed."
        ).font(.caption2).foregroundStyle(.secondary)
      }
    }
  }
  var eyeHUD: some View {
    VStack(spacing: 12) {
      if s.phase == .active {
        Text(Duration.seconds(s.remaining).formatted(.time(pattern: .minuteSecond))).font(
          .system(.title2, design: .monospaced)
        ).foregroundStyle(.mint)
      }
      Spacer()
      if s.loading || s.phase == .planning {
        ProgressView().tint(.mint)
        Text(s.phase == .planning ? "BUILDING YOUR WORLD" : "ONE MOMENT").font(.caption2).tracking(
          3)
      }
      Text(s.message).font(.system(size: 17, weight: .medium, design: .rounded))
        .multilineTextAlignment(.center).lineLimit(8).shadow(radius: 5)
      if s.phase == .active {
        Text(
          s.scene["interactions"].list.flatMap { $0["choices"].list.map { $0["label"].text } }
            .joined(separator: " · ")
        ).font(.caption).foregroundStyle(.mint)
      }
      Text(s.transcript).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      if [.headset, .history, .reflectionPrompt, .feedbackPrompt, .repeatPrompt].contains(s.phase) {
        HStack {
          Button("Yes") { s.heard("yes", final: true, id: UUID().uuidString) }
          Button("No") { s.heard("no", final: true, id: UUID().uuidString) }
        }.buttonStyle(.bordered)
      }
      if s.phase == .lobby {
        Button("Start") { s.heard("start", final: true, id: UUID().uuidString) }.buttonStyle(
          .borderedProminent
        ).tint(.mint)
      }
      if s.phase == .error {
        HStack {
          ForEach(["Retry", "Revise", "Cancel"], id: \.self) { v in
            Button(v) { s.heard(v, final: true, id: UUID().uuidString) }
          }
        }
      }
      HStack {
        TextField("Backup voice input", text: $typed).textFieldStyle(.roundedBorder).onSubmit {
          submit()
        }
        Button("Send") { submit() }
        Button("STOP") { s.stop() }.tint(.orange)
      }.font(.caption)
      Text(s.connection).font(.caption2).foregroundStyle(.secondary)
      Spacer().frame(height: 20)
    }.padding(.horizontal, 26).padding(.top, 30)
  }
  var pauseHUD: some View {
    VStack(spacing: 20) {
      Text(s.pauses.contains("user_stop") ? "Quit simulation?" : "Paused").font(.title2)
      if s.pauses.contains("user_stop") {
        Text("Say YES to finish · NO to resume").font(.caption)
        HStack {
          Button("Yes") { s.heard("yes", final: true, id: UUID().uuidString) }
          Button("No") { s.heard("no", final: true, id: UUID().uuidString) }
        }
      }
      if s.pauses.contains("portrait") { Text("Return your phone to landscape.").font(.caption) }
      if s.pauses.contains("command_channel_unavailable") {
        Button("Reconnect voice") { s.reconnect() }
      }
      if s.pauses.contains("audio_interruption") {
        Button("Restore audio") { s.pause("audio_interruption", enabled: false) }
      }
      Button("End & remove viewer") {
        s.pauses = []
        s.finish(early: true)
      }
    }.padding()
  }
  func applyViewer() {
    s.world.ipd = Float(ipd / 1000)
    s.world.fov = fov
    s.world.lensK1 = Float(k1)
    s.world.lensK2 = Float(k2)
  }
  func submit() {
    let t = typed
    typed = ""
    s.heard(t, final: true, id: UUID().uuidString)
  }
  var settingsView: some View {
    NavigationStack {
      Form {
        Section("Viewer calibration") {
          Slider(value: $ipd, in: 55...75, step: 1)
          Text("Eye separation: \(Int(ipd)) mm")
          Slider(value: $fov, in: 45...100)
          Text("Field of view: \(Int(fov))°")
          Slider(value: $k1, in: 0...0.6, step: 0.01)
          Text("Radial K1: \(k1,specifier:"%.2f")")
          Slider(value: $k2, in: 0...0.6, step: 0.01)
          Text("Radial K2: \(k2,specifier:"%.2f")")
          Button("Apply & recenter") {
            applyViewer()
            s.world.recenter()
          }
          Text(
            "Optical distortion and physical fit must be verified on the actual goggles before demo use."
          ).font(.caption)
        }
        Section("Session files") {
          ShareLink(
            "Share session spreadsheet", item: s.store.root.appendingPathComponent("SESSIONS.csv"))
          Button("Delete all local history and reflections", role: .destructive) {
            confirmDelete = true
          }
        }
        Section("Connection") {
          Text(s.server)
          Text(s.connection)
        }
      }.navigationTitle("Braive settings").toolbar { Button("Done") { settings = false } }
        .confirmationDialog("Delete all sessions and reflections?", isPresented: $confirmDelete) {
          Button("Delete all", role: .destructive) {
            do { try s.store.deleteAll() } catch { s.fail(error) }
          }
        }
    }
  }
}
