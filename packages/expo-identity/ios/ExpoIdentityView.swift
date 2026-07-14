import ExpoModulesCore
import PassKit
import SwiftUI
import UIKit

@available(iOS 16.0, *)
class ExpoIdentityView: ExpoView {
  let onLoad = EventDispatcher()
  let onButtonPress = EventDispatcher()
  let onCompletion = EventDispatcher()

  private var hostingController: UIHostingController<AnyView>?
  private var currentLabel: ExpoVerifyIdentityWithWalletButtonLabel = .verifyIdentity
  private var currentStyle: ExpoVerifyIdentityWithWalletButtonStyle = .black
  private var requestStorage: Any?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    onLoad([:])
  }

  var labelRawValue: String {
    get { currentLabel.rawValue }
    set {
      guard let next = ExpoVerifyIdentityWithWalletButtonLabel(rawValue: newValue),
            next != currentLabel else {
        return
      }
      currentLabel = next
      updateButton()
    }
  }

  var buttonStyleRawValue: String {
    get { currentStyle.rawValue }
    set {
      guard let next = ExpoVerifyIdentityWithWalletButtonStyle(rawValue: newValue),
            next != currentStyle else {
        return
      }
      currentStyle = next
      updateButton()
    }
  }

  func clearIdentityRequest() {
    requestStorage = nil
    updateButton()
  }

  @available(iOS 18.0, *)
  func setIdentityRequest(_ request: PKIdentityRequest?) {
    requestStorage = request
    updateButton()
  }

  func updateButtonIfNeeded() {
    updateButton()
  }

  private func updateButton() {
    guard #available(iOS 18.0, *),
          let request = requestStorage as? PKIdentityRequest else {
      tearDownHostingController()
      return
    }

    let label = currentLabel.nativeLabel
    let style = currentStyle.nativeStyle

    let button = VerifyIdentityWithWalletButton(label, request: request) { [weak self] result in
      guard let self = self else { return }

      self.onButtonPress([:])

      switch result {
      case .success(let document):
        self.onCompletion([
          "ok": true,
          "encryptedData": document.encryptedData.base64EncodedString()
        ])
      case .failure(let error):
        let nsError = error as NSError
        self.onCompletion([
          "ok": false,
          "error": nsError.localizedDescription,
          "code": nsError.code,
          "domain": nsError.domain
        ])
      }
    }
    .verifyIdentityWithWalletButtonStyle(style)

    let controller = ensureHostingController()
    controller.rootView = AnyView(button)
  }

  private func ensureHostingController() -> UIHostingController<AnyView> {
    if let controller = hostingController {
      return controller
    }

    let controller = UIHostingController(rootView: AnyView(EmptyView()))
    controller.view.backgroundColor = .clear
    controller.view.translatesAutoresizingMaskIntoConstraints = false

    addSubview(controller.view)
    NSLayoutConstraint.activate([
      controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      controller.view.topAnchor.constraint(equalTo: topAnchor),
      controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    hostingController = controller
    return controller
  }

  private func tearDownHostingController() {
    hostingController?.view.removeFromSuperview()
    hostingController = nil
  }

  @objc
  func setHide(_ hide: NSNumber?) {
    isHidden = hide?.boolValue ?? false
  }
}
