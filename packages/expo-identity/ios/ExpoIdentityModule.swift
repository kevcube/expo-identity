import ExpoModulesCore
import PassKit
import SwiftUI
import UIKit

@available(iOS 16.0, *)
public enum ExpoIdentityDocumentKind: String, Enumerable {
  case driversLicense
  case nationalIDCard
  case photoID

  var descriptor: PKIdentityDocumentDescriptor? {
    switch self {
    case .driversLicense:
      return PKIdentityDriversLicenseDescriptor()
    case .nationalIDCard:
      if #available(iOS 18.0, *) {
        return PKIdentityNationalIDCardDescriptor()
      } else {
        return nil
      }
    case .photoID:
      if #available(iOS 26.0, *) {
        return PKIdentityPhotoIDDescriptor()
      } else {
        return nil
      }
    }
  }
}

@available(iOS 16.0, *)
public enum ExpoVerifyIdentityWithWalletButtonLabel: String, Enumerable {
  case `continue` = "continue"
  case verify = "verify"
  case verifyAge = "verifyAge"
  case verifyIdentity = "verifyIdentity"

  @available(iOS 18.0, *)
  var nativeLabel: VerifyIdentityWithWalletButtonLabel {
    switch self {
    case .continue: return .continue
    case .verify: return .verify
    case .verifyAge: return .verifyAge
    case .verifyIdentity: return .verifyIdentity
    }
  }
}

@available(iOS 16.0, *)
public enum ExpoVerifyIdentityWithWalletButtonStyle: String, Enumerable {
  case black = "black"
  case blackOutline = "blackOutline"

  @available(iOS 18.0, *)
  var nativeStyle: VerifyIdentityWithWalletButtonStyle {
    switch self {
    case .black: return .black
    case .blackOutline: return .blackOutline
    }
  }
}

// MARK: - Expo Module
@available(iOS 16.0, *)
public class ExpoIdentityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoIdentity")

    View(ExpoIdentityView.self) {
      Events("onLoad", "onButtonPress", "onAvailabilityChange", "onCompletion")

      Prop("documentKind") { (view: ExpoIdentityView, kind: ExpoIdentityDocumentKind?) in
        view.documentKind = kind ?? .driversLicense
      }

      Prop("label") { (view: ExpoIdentityView, label: ExpoVerifyIdentityWithWalletButtonLabel) in
        view.label = label
      }

      Prop("buttonStyle") { (view: ExpoIdentityView, style: ExpoVerifyIdentityWithWalletButtonStyle) in
        view.buttonStyle = style
      }

      Prop("identityRequest") { (view: ExpoIdentityView, jsDict: [String: Any]?) in
        guard let jsDict = jsDict else { return }
        if #available(iOS 18.0, *) {
          do {
            if let req = try ExpoIdentityModule.buildPKRequest(from: jsDict) {
              if let merchant = jsDict["merchantIdentifier"] as? String, !merchant.isEmpty {
                req.merchantIdentifier = merchant
              }
              view.pkRequestOpaque = req
            }
          } catch {
            // Ignore, fallback to simple press
          }
        } else {
          view.pkRequestOpaque = nil
        }
      }

      // Do not declare a children prop; React Native manages child views
    }

    AsyncFunction("canRequestIdentityDocument") { (kindString: String, promise: Promise) in
      let kind = ExpoIdentityDocumentKind(rawValue: kindString) ?? .driversLicense
      guard let descriptor = kind.descriptor else {
        promise.resolve(false)
        return
      }
      if #available(iOS 18.0, *) {
        let controller = PKIdentityAuthorizationController()
        Task {
          let can = await controller.canRequestDocument(descriptor)
          promise.resolve(can)
        }
      } else {
        promise.resolve(false)
      }
    }

    AsyncFunction("requestIdentityDocument") { (jsRequest: [String: Any], promise: Promise) in
      if #available(iOS 18.0, *) {
        do {
          guard let pkRequest = try ExpoIdentityModule.buildPKRequest(from: jsRequest) else {
            promise.reject("ERR_INVALID_REQUEST", "No valid identity documents or elements provided.")
            return
          }

          if let merchant = jsRequest["merchantIdentifier"] as? String, !merchant.isEmpty {
            pkRequest.merchantIdentifier = merchant
          }
          // No extra validation; let PassKit validate

          DispatchQueue.main.async {
            let hostingVC = UIHostingController(rootView: VerifyIdentityWithWalletButton(.verifyIdentity, request: pkRequest) { result in
              DispatchQueue.main.async {
                switch result {
                case .success:
                  promise.resolve(true)
                case .failure(let error):
                  promise.reject("REQUEST_FAILED", error.localizedDescription)
                }
              }
            })
            hostingVC.modalPresentationStyle = .overFullScreen
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first,
               let rootVC = window.rootViewController {
              rootVC.present(hostingVC, animated: true)
            } else {
              promise.reject("NO_WINDOW", "Cannot present view controller")
            }
          }
        } catch {
          promise.reject("ERR_REQUEST_BUILD", error.localizedDescription)
        }
      } else {
        promise.reject("UNAVAILABLE", "VerifyIdentityWithWalletButton requires iOS 18+")
      }
    }
  }

  @available(iOS 18.0, *)
  private static func buildPKRequest(from js: [String: Any]) throws -> PKIdentityRequest? {
    var descriptors: [PKIdentityDocumentDescriptor] = []

    let providedNonce: Data? = {
      if let nonceString = js["nonce"] as? String {
        if let decoded = Data(base64Encoded: nonceString) {
          return decoded
        }
        return Data(nonceString.utf8)
      }
      return nil
    }()

    for (docKey, specAny) in js {
      guard let spec = specAny as? [String: Any],
            let elementItems = spec["elements"] as? [Any] else { continue }

      let kindString = docKey
      var descriptor: PKIdentityDocumentDescriptor?
      if kindString == "driversLicense" {
        descriptor = PKIdentityDriversLicenseDescriptor()
      } else if kindString == "nationalIDCard" {
        descriptor = PKIdentityNationalIDCardDescriptor()
      } else if kindString == "photoID" {
        if #available(iOS 26.0, *) {
          descriptor = PKIdentityPhotoIDDescriptor()
        }
      }
      guard let descriptor = descriptor else { continue }

      // Manual intent parsing
      var intent: PKIdentityIntentToStore = .willNotStore
      if let intentDict = spec["intentToStore"] as? [String: Any],
         let intentStr = intentDict["intentToStore"] as? String {
        switch intentStr {
        case "willNotStore":
          intent = .willNotStore
        case "mayStore":
          if let days = intentDict["days"] as? Int {
            intent = .mayStore(days: days)
          } else {
            intent = .mayStore
          }
        default:
          break
        }
      }

      // Manual element parsing - flexible to handle any element
      let elements: [PKIdentityElement] = elementItems.compactMap { item in
        if let str = item as? String {
          switch str {
          case "givenName": return .givenName
          case "familyName": return .familyName
          case "portrait": return .portrait
          case "address": return .address
          case "documentNumber": return .documentNumber
          case "dateOfBirth": return .dateOfBirth
          case "age": return .age
          case "sex":
            if #available(iOS 17.2, *) { return .sex }
          case "issuingAuthority": return .issuingAuthority
          case "documentExpirationDate": return .documentExpirationDate
          case "documentIssueDate": return .documentIssueDate
          case "drivingPrivilege": return .drivingPrivileges
          case "drivingPrivileges": return .drivingPrivileges // Alternative spelling
          default: 
            // Log unknown elements but don't fail - allows future extensibility
            NSLog("ExpoIdentity: Unknown element requested: \(str)")
            return nil
          }
        }
        if let obj = item as? [String: Any],
           let t = obj["type"] as? String,
           t == "ageAtLeast",
           let n = obj["threshold"] as? Int,
           #available(iOS 17.2, *) {
          return PKIdentityElement.age(atLeast: n)
        }
        return nil
      }

      guard !elements.isEmpty else { continue }
      descriptor.addElements(elements, intentToStore: intent)
      descriptors.append(descriptor)
    }

    guard !descriptors.isEmpty else { return nil }

    let request = PKIdentityRequest()
    
    // Either use the provided nonce or fall back to a random UUID string.
    if let providedNonce {
      request.nonce = providedNonce
    } else {
      request.nonce = UUID().uuidString.data(using: .utf8) ?? Data()
    }
    
    if descriptors.count == 1 {
      request.descriptor = descriptors[0]
    } else {
      if #available(iOS 26.0, *) {
        request.descriptor = PKIdentityAnyOfDescriptor(descriptors: descriptors)
      } else {
        throw Exception(name: "ERR_MULTI_DOC", description: "Multiple documents require iOS 26+", code: "ERR_MULTI_DOC")
      }
    }
    return request
  }
}
