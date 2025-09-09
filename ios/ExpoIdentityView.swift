import ExpoModulesCore
import SwiftUI
import PassKit



@available(iOS 16.0, *)
class VerifyWithWalletButton: ExpoView {
  let verifyIdentityWithWalletButton = VerifyIdentityWithWalletButton()

  let onLoad = EventDispatcher()                // fired when the button is rendered
  let onButtonPress = EventDispatcher()         // fired when the button is tapped
  let onAvailabilityChange = EventDispatcher()  // fired when PassKit support status changes
  let onCompletion = EventDispatcher()          // fired with result/error from flow (if wired)

  // Host SwiftUI VerifyIdentityWithWalletButton inside this view
  private var hostingController: UIViewController?
  private var hostedView: UIView?
  private var hasRenderedButton = false
  private var isCurrentlyAvailable: Bool?

  // Which document we are checking for requestability
  var documentKind: ExpoIdentityDocumentKind = .nationalIDCard {
    didSet {
      guard oldValue.rawValue != documentKind.rawValue else { return }
      configureButtonIfSupported()
    }
  }

  // Apple docs (Context7) show label and style identifiers:
  // VerifyIdentityWithWalletButtonLabel: .continue, .verify, .verifyAge, .verifyIdentity
  // VerifyIdentityWithWalletButtonStyle: .black, .blackOutline
  // https://developer.apple.com/documentation/passkit/verifyidentitywithwalletbutton
  // https://developer.apple.com/documentation/passkit/verifyidentitywithwalletbuttonstyle
  @available(iOS 16.0, *)
  var label: VerifyIdentityWithWalletButtonLabel = .verifyIdentity {
    didSet { rerenderIfNeeded() }
  }

  @available(iOS 16.0, *)
  var style: VerifyIdentityWithWalletButtonStyle = .black {
    didSet { rerenderIfNeeded() }
  }

  // Optional PassKit request to run directly from the button.
  // When set, we use the initializer with `request:onCompletion:` and
  // forward results through `onCompletion`.
  var identityRequest: PKIdentityRequest? {
    didSet { rerenderIfNeeded() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    configureButtonIfSupported()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if let hosted = hostedView, hosted.translatesAutoresizingMaskIntoConstraints {
      hosted.frame = bounds
    }
  }

  private func removeHostedViewIfPresent() {
    hostedView?.removeFromSuperview()
    hostedView = nil
    hostingController = nil
    hasRenderedButton = false
  }

  private func rerenderIfNeeded() {
    guard hasRenderedButton else { return }
    renderButton(force: true)
  }

  private func renderButton(force: Bool = false) {
    if hasRenderedButton && !force { return }
    guard #available(iOS 16.0, *) else { return }

    // Apple VerifyIdentityWithWalletButton initializers (Context7):
    // init(_ label: VerifyIdentityWithWalletButtonLabel, action: () -> Void)
    // init(_ label: VerifyIdentityWithWalletButtonLabel, request: PKIdentityRequest, onCompletion: ...)
    // https://developer.apple.com/documentation/passkit/verifyidentitywithwalletbutton
    let anyView: AnyView
    if let request = identityRequest {
      let button = VerifyIdentityWithWalletButton(label, request: request) { result in
        switch result {
        case .success(_):
          self.onCompletion(["ok": true])
        case .failure(let error):
          self.onCompletion(["ok": false, "error": error.localizedDescription])
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      .verifyIdentityWithWalletButtonStyle(style)
      anyView = AnyView(button)
    } else {
      let button = VerifyIdentityWithWalletButton(label) {
        self.onButtonPress([:])
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      .verifyIdentityWithWalletButtonStyle(style)
      anyView = AnyView(button)
    }

    let host = UIHostingController(rootView: anyView)
    hostingController = host
    hostedView = host.view
    guard let hosted = host.view else { return }
    hosted.backgroundColor = .clear
    hosted.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hosted)
    NSLayoutConstraint.activate([
      hosted.leadingAnchor.constraint(equalTo: leadingAnchor),
      hosted.trailingAnchor.constraint(equalTo: trailingAnchor),
      hosted.topAnchor.constraint(equalTo: topAnchor),
      hosted.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    hasRenderedButton = true
    onLoad([:])
  }

  private func configureButtonIfSupported() {
    // Clear previous UI
    removeHostedViewIfPresent()

    // On Simulator, bypass the availability check and always render.
    #if targetEnvironment(simulator)
    renderButton()
    isCurrentlyAvailable = true
    onAvailabilityChange(["available": true])
    return
    #endif

    guard let descriptor = documentKind.descriptor else {
      isCurrentlyAvailable = false
      return
    }

    Task { [weak self] in
      let ok = await PKIdentitySupportChecker.canRequest(descriptor)
      await MainActor.run {
        guard let self else { return }
        if self.isCurrentlyAvailable != ok {
          self.onAvailabilityChange(["available": ok])
        }
        self.isCurrentlyAvailable = ok
        if ok { self.renderButton() } else { self.removeHostedViewIfPresent() }
      }
    }
  }
}
