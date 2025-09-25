import ExpoModulesCore
import SwiftUI
import PassKit
import UIKit

@available(iOS 16.0, *)
class ExpoIdentityView: ExpoView {
  let onLoad = EventDispatcher()
  let onAvailabilityChange = EventDispatcher()
  let onButtonPress = EventDispatcher()
  let onCompletion = EventDispatcher()

  // Host SwiftUI VerifyIdentityWithWalletButton inside this view
  private var hostingController: UIHostingController<AnyView>?
  private var hostedView: UIView?
  private var hasRenderedButton = false
  private var isCurrentlyAvailable: Bool = false

  // Props
  var documentKind: ExpoIdentityDocumentKind = .driversLicense {
    didSet {
      guard oldValue.rawValue != documentKind.rawValue else { return }
      checkAvailability()
    }
  }

  // Use module-defined enums to avoid referencing iOS 18-only symbols at type level
  var label: ExpoVerifyIdentityWithWalletButtonLabel = .verifyIdentity {
    didSet { rerenderIfNeeded() }
  }

  var buttonStyle: ExpoVerifyIdentityWithWalletButtonStyle = .black {
    didSet { rerenderIfNeeded() }
  }

  // Avoid referencing PKIdentityRequest at type level so code compiles on < iOS 18
  var pkRequestOpaque: Any? {
    didSet { rerenderIfNeeded() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    checkAvailability()
  }

  override var intrinsicContentSize: CGSize {
    // Provide a sensible default height so RN lays the view out even without explicit styles.
    return CGSize(width: UIView.noIntrinsicMetric, height: 44)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostedView?.frame = bounds
  }

  private func checkAvailability() {
    if #available(iOS 18.0, *), let descriptor = documentKind.descriptor {
      let controller = PKIdentityAuthorizationController()
      Task {
        let available = await controller.canRequestDocument(descriptor)
        await MainActor.run {
          self.isCurrentlyAvailable = available
          self.onAvailabilityChange(["available": available])
          self.configureButtonIfSupported()
        }
      }
    } else {
      isCurrentlyAvailable = false
      onAvailabilityChange(["available": false])
      configureButtonIfSupported()
    }
  }

  // React Native manages child subviews; no custom layout needed

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

    removeHostedViewIfPresent()

    let anyView: AnyView
    if #available(iOS 18.0, *), let request = pkRequestOpaque as? PKIdentityRequest {
        let button = VerifyIdentityWithWalletButton(label.nativeLabel, request: request) { result in
          switch result {
          case .success(let document):
            let payload: [String: Any] = [
              "ok": true,
              "encryptedData": document.encryptedData.base64EncodedString()
            ]
            self.onCompletion(payload)
          case .failure(let error):
            let ns = error as NSError
            self.onCompletion(["ok": false, "error": ns.localizedDescription, "code": ns.code, "domain": ns.domain])
          }
        }
        .verifyIdentityWithWalletButtonStyle(buttonStyle.nativeStyle)

        anyView = AnyView(HStack { Spacer(); button; Spacer() }
          .frame(maxWidth: .infinity, alignment: .center)
          .frame(minHeight: 44)
        )
    } else if #available(iOS 18.0, *) {
        let button = VerifyIdentityWithWalletButton(label.nativeLabel) {
          self.onButtonPress([:])
        }
        .verifyIdentityWithWalletButtonStyle(buttonStyle.nativeStyle)

        anyView = AnyView(HStack { Spacer(); button; Spacer() }
          .frame(maxWidth: .infinity, alignment: .center)
          .frame(minHeight: 44)
        )
    } else {
      // iOS versions that don't support the native button: show RN children
      removeHostedViewIfPresent()
      return
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
    // Render if available; also render if a request is provided (let OS decide enablement)
    if isCurrentlyAvailable || pkRequestOpaque != nil {
      renderButton()
    } else {
      removeHostedViewIfPresent()
    }
  }
}
