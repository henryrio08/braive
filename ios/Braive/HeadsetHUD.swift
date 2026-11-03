import SwiftUI

/// Glanceable cues are separate from the complete spoken prompt and phone transcript.
struct HeadsetCopy {
  let title: String
  var detail = ""
  var command = ""
  var hint = ""

  static func excerpt(_ text: String) -> String {
    if text.count > 110, let end = text.range(of: #"[.!?](?:\s|$)"#, options: .regularExpression) {
      let sentence = String(text[...end.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
      if (30...110).contains(sentence.count) { return sentence }
    }
    let words = text.split(whereSeparator: \.isWhitespace)
    var result = ""
    for word in words {
      let next = result.isEmpty ? String(word) : result + " " + word
      if next.count > 110 { return result.isEmpty ? "Listen to your next instruction." : result + "…" }
      result = next
    }
    return result
  }
}

struct HeadsetHUD: View {
  let copy: HeadsetCopy
  let status: String
  var remaining: Double?
  var preparing = false
  private let accent = Color(red: 0.94, green: 0.74, blue: 0.58)

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 12) {
        HStack(spacing: 6) {
          Image(systemName: "waveform").font(.system(size: 10))
          Text(status).font(.system(size: 10))
          Spacer()
          if let remaining {
            Text(Duration.seconds(remaining).formatted(.time(pattern: .minuteSecond)))
              .font(.system(size: 18, weight: .medium, design: .monospaced)).foregroundStyle(accent)
          }
        }.foregroundStyle(.white.opacity(0.65))
        Spacer(minLength: 0)
        ViewThatFits(in: .vertical) {
          prompt(showDetail: true)
          prompt(showDetail: false)
        }
        Spacer(minLength: 0)
        VStack(spacing: 6) {
          if !copy.command.isEmpty {
            Text(copy.command).font(.system(size: 14, weight: .semibold)).foregroundStyle(accent)
          }
          if !copy.hint.isEmpty {
            Text(copy.hint).font(.system(size: 11)).foregroundStyle(.white.opacity(0.65))
          }
        }.fixedSize(horizontal: false, vertical: true)
      }
      .multilineTextAlignment(.center)
      .padding(.horizontal, geometry.size.width < 350 ? 20 : 30)
      .padding(.vertical, geometry.size.height < 300 ? 12 : 22)
      .frame(width: geometry.size.width, height: geometry.size.height)
      .shadow(color: .black.opacity(0.8), radius: 5)
    }
  }
  private func prompt(showDetail: Bool) -> some View {
    VStack(spacing: 10) {
      if preparing { ProgressView().tint(accent) }
      if !copy.title.isEmpty { Text(copy.title).font(.system(size: 23, weight: .medium, design: .serif)) }
      if showDetail && !copy.detail.isEmpty {
        Text(copy.detail).font(.system(size: 15)).foregroundStyle(.white.opacity(0.85))
      }
    }.fixedSize(horizontal: false, vertical: true)
  }
  #if DEBUG
  /// Explicit visual review of the real SwiftUI layout, without voice or provider calls.
  @MainActor static func renderReview(_ copies: [(String, HeadsetCopy)], to folder: URL) throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    for (name, copy) in copies {
      for (width, height) in [(852.0, 340.0), (667.0, 240.0)] {
        let view = ZStack {
          LinearGradient(colors: [Color(red: 0.07, green: 0.14, blue: 0.12), .black], startPoint: .topLeading, endPoint: .bottomTrailing)
          HStack(spacing: 0) {
            ForEach(0..<2) { _ in
              HeadsetHUD(copy: copy, status: "Listening", remaining: name == "active" ? 83 : nil)
                .frame(width: width / 2, height: height)
            }
          }
        }.frame(width: width, height: height).foregroundStyle(.white).environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: view); renderer.scale = 2
        guard let data = renderer.uiImage?.pngData() else { throw CocoaError(.fileWriteUnknown) }
        try data.write(to: folder.appendingPathComponent("\(name)-\(Int(width)).png"))
      }
    }
  }
  #endif
}

@MainActor extension Session {
  var headsetCopy: HeadsetCopy {
    if loading { return HeadsetCopy(title: "One moment…", detail: loadingTip) }
    if adapting { return HeadsetCopy(title: "Shaping your next try…", detail: loadingTip) }
    if phase == .planning && builder { return HeadsetCopy(title: "What would you add?", detail: "Take your time. I’m listening.", command: "Say THAT’S ALL when finished", hint: "START OVER to replace your answer") }
    switch phase {
    case .setup: return HeadsetCopy(title: "Welcome to Braive")
    case .lobby: return HeadsetCopy(title: "Make room for your next try.", command: "Say START when you’re ready")
    case .headset: return HeadsetCopy(title: "Find your forward.", detail: "Look straight ahead comfortably.", command: "Say YES when your headset is ready")
    case .intake: return HeadsetCopy(title: "What would you like to practice?", detail: "Describe the moment, place and people.", command: "Say THAT’S ALL when finished", hint: "START OVER to replace your answer")
    case .ability: return HeadsetCopy(title: "What feels manageable?", detail: "Share your comfort level and boundaries.", command: "Say THAT’S ALL when finished", hint: "START OVER to replace your answer")
    case .review: return HeadsetCopy(title: "Here’s what I heard.", detail: "Listen to your situation and boundaries.", command: "Say BEGIN PRACTICE when ready", hint: "START OVER to change your answers")
    case .history: return HeadsetCopy(title: "Build on past practice?", detail: "Include your previous sessions this time?", command: "Say YES or NO")
    case .planning: return HeadsetCopy(title: "Shaping your practice…", detail: loadingTip, hint: "STOP to pause")
    case .intro: return HeadsetCopy(title: "Listen. Picture yourself here.", hint: "STOP to pause")
    case .reveal: return HeadsetCopy(title: "Take a look around.", hint: "STOP to pause")
    case .active: return HeadsetCopy(title: "", hint: "STOP to pause")
    case .selfReport: return HeadsetCopy(title: "How difficult did it feel?", command: "Say a number from 0 to 10", hint: "Or say SKIP")
    case .readiness: return HeadsetCopy(title: "How ready do you feel now?", command: "Say a number from 0 to 10", hint: "Or say SKIP")
    case .reflectionPrompt: return HeadsetCopy(title: "Keep a spoken reflection?", command: "Say YES or NO")
    case .reflection: return HeadsetCopy(title: "Make a note for next time.", detail: "Share what stood out. Take your time.", command: "Say SAVE REFLECTION when finished", hint: "Or say SKIP")
    case .feedbackPrompt: return HeadsetCopy(title: "Hear some feedback?", command: "Say YES or NO")
    case .feedback:
      return HeadsetCopy(title: "Your practice, reflected.", detail: message == "Reviewing your session…" ? loadingTip : record["feedback"].object != nil ? "Listen to your feedback." : "Listen to your session update.", hint: "CONTINUE to move on")
    case .saving: return HeadsetCopy(title: "Saving your practice…", detail: loadingTip)
    case .repeatPrompt: return HeadsetCopy(title: "Ready for another try?", detail: adapting ? loadingTip : "Build on what you just practiced.", command: adapting ? "" : "Say YES or NO")
    case .error: return HeadsetCopy(title: "Let’s take a moment.", detail: "Listen to what happened.", command: pendingPostSave == nil ? "Say RETRY, REVISE or CANCEL" : "Say RETRY to save again", hint: "Full details in phone controls")
    }
  }
  var pausedHeadsetCopy: HeadsetCopy {
    if pauses.contains("command_channel_unavailable") || pauses.contains("audio_interruption") {
      return HeadsetCopy(title: "Your place is saved.", detail: "Voice needs reconnecting.", command: "Remove the viewer", hint: "Hold the screen for phone controls")
    }
    if pauses.contains("user_stop") {
      return HeadsetCopy(title: "End this practice?", detail: pauses.contains("portrait") ? "Turn the phone sideways to resume." : "Your place is saved.", command: "Say YES to end · NO to continue")
    }
    if pauses.contains("portrait") { return HeadsetCopy(title: "Take a moment.", command: "Turn the phone sideways to continue") }
    return HeadsetCopy(title: "Your practice is paused.", detail: "Your place is saved.")
  }
}
