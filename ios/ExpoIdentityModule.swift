import ExpoModulesCore
import PassKit
import UIKit

enum WalletVerifyLabel: String, Enumerable {
  case verifyIdentity
  case verify
  case verifyAge
  case `continue`
}

extension WalletVerifyLabel {
  var appleLabel: VerifyIdentityWithWalletButtonLabel {
    switch self {
    case .verifyIdentity: .verifyIdentity
    case .verify:         .verify
    case .verifyAge:      .verifyAge
    case .continue:       .continue
    }
  }
}

@available(iOS 16.0, *)
public enum ExpoIdentityDocumentKind: String, Convertible {
  case driversLicense
  case nationalIDCard
  case photoID

  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard let str = value as? String, let kind = Self(rawValue: str) else {
      throw Conversions.ConvertingException<Self>(value)
    }
    return kind
  }

  /// Returns the appropriate PassKit descriptor for this kind, or `nil` if
  /// the current OS version does not support it.
  var descriptor: PKIdentityDocumentDescriptor? {
    switch self {
    case .driversLicense:
      return PKIdentityDriversLicenseDescriptor()
    case .nationalIDCard:
      if #available(iOS 18.0, *) { return PKIdentityNationalIDCardDescriptor() }
      return nil
    case .photoID:
      if #available(iOS 26.0, *) { return PKIdentityPhotoIDDescriptor() }
      return nil
    }
  }
}

@available(iOS 16.0, *)
public enum ExpoVerifyIdentityWithWalletButtonLabel: String, Convertible {
  case `continue` = "continue"
  case verify = "verify"
  case verifyAge = "verifyAge"
  case verifyIdentity = "verifyIdentity"

  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard let str = value as? String, let label = Self(rawValue: str) else {
      throw Conversions.ConvertingException<Self>(value)
    }
    return label
  }
}

@available(iOS 16.0, *)
public enum ExpoVerifyIdentityWithWalletButtonStyle: String, Convertible {
  case black = "black"
  case blackOutline = "blackOutline"

  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard let str = value as? String, let style = Self(rawValue: str) else {
      throw Conversions.ConvertingException<Self>(value)
    }
    return style
  }
}

@available(iOS 16.0, *)
extension PKIdentityIntentToStore: @retroactive Convertible {
  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard
      let dict = value as? [String: Any],
      let intent = dict["intentToStore"] as? String
    else {
      throw Conversions.ConvertingException<Self>(value)
    }

    switch intent {
    case "willNotStore":
      return Self.willNotStore as! Self

    case "mayStore":
      if let days = dict["days"] as? Int {

    return Self.mayStore(days: days)     // parameterised variant

      }
      return Self.mayStore as! Self

    default:
      throw Conversions.ConvertingException<Self>(value)
    }
  }
}

// Common identity elements.
@available(iOS 16.0, *)
extension PKIdentityElement: @retroactive Convertible {
  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard let str = value as? String else {
      throw Conversions.ConvertingException<Self>(value)
    }

    switch str {
    case "givenName":              return Self.givenName as! Self
    case "familyName":             return Self.familyName as! Self
    case "portrait":               return Self.portrait as! Self
    case "address":                return Self.address as! Self
    case "documentNumber":         return Self.documentNumber as! Self
    case "dateOfBirth":            return Self.dateOfBirth as! Self
    case "age":                    return Self.age as! Self
    case "sex":
      if #available(iOS 17.2, *) { return Self.sex as! Self }
      break
    case "issuingAuthority":       return Self.issuingAuthority as! Self
    case "documentExpirationDate": return Self.documentExpirationDate as! Self
    case "documentIssueDate":      return Self.documentIssueDate as! Self
    case "drivingPrivilege":       return Self.drivingPrivileges as! Self
    default:
      break
    }

    throw Conversions.ConvertingException<Self>(value)
  }
}

// Centralized support probe that abstracts iOS API differences.
@available(iOS 16.0, *)
enum PKIdentitySupportChecker {
  static func canRequest(_ descriptor: PKIdentityDocumentDescriptor) async -> Bool {
    if #available(iOS 26.0, *) {
      return await withCheckedContinuation { continuation in
        let controller: PKIdentityAuthorizationController = PKIdentityAuthorizationController()
        controller.checkCanRequestDocument(descriptor) { can in
          continuation.resume(returning: can)
        }
      }
    } else {
      return await PKIdentityAuthorizationController().canRequestDocument(descriptor)
    }
  }
}

// MARK: - Expo Module
// -----------------------------------------------------------------------------
@available(iOS 16.0, *)
public class ExpoIdentityModule: Module {
  private var activeController: PKIdentityAuthorizationController?

  public func definition() -> ModuleDefinition {
    Name("ExpoIdentity")

    // Expose a native view so apps can render the standard
    // "Verify with Wallet" button provided by Apple.
    View(VerifyWithWalletButtonView.self) {
      Events("onLoad", "onButtonPress", "onAvailabilityChange", "onCompletion")
      Prop("documentKind") { (view: VerifyWithWalletButtonView, kind: ExpoIdentityDocumentKind?) in
        view.documentKind = kind ?? .nationalIDCard
      }
      Prop("label") { (view: VerifyWithWalletButtonView, label: ExpoVerifyIdentityWithWalletButtonLabel) in
        switch label {
        case .continue:
          view.label = .continue
        case .verify:
          view.label = .verify
        case .verifyAge:
          view.label = .verifyAge
        case .verifyIdentity:
          view.label = .verifyIdentity
        }
      }
      Prop("buttonStyle") { (view: VerifyWithWalletButtonView, style: ExpoVerifyIdentityWithWalletButtonStyle) in
        switch style {
        case .black:
          view.style = .black
        case .blackOutline:
          view.style = .blackOutline
        }
      }
      Prop("identityRequest") { (view: VerifyWithWalletButtonView, jsDict: [String: Any]?) in
        guard let jsDict = jsDict else { return }
        do {
          if let req = try ExpoIdentityModule.buildPKRequest(from: jsDict) {
            view.identityRequest = req
          }
        } catch {
          // Ignore build errors, fall back to simple press
        }
      }
    }

    // Simple capability probe -------------------------------------------------
    AsyncFunction("canRequestIdentityDocument") { (documentKind: ExpoIdentityDocumentKind, promise: Promise) in
      guard let descriptor = documentKind.descriptor else {
        promise.resolve(false)
        return
      }
      Task {
        let ok = await PKIdentitySupportChecker.canRequest(descriptor)
        promise.resolve(ok)
      }
    }

    // Main request ------------------------------------------------------------
    AsyncFunction("requestIdentityDocument") { (documentRequest: [String: Any], promise: Promise) in
      do {
        guard let pkRequest = try ExpoIdentityModule.buildPKRequest(from: documentRequest) else {
          promise.reject("ERR_INVALID_REQUEST",
                         "No valid identity documents or elements provided.")
          return
        }

        pkRequest.merchantIdentifier = Bundle.main.bundleIdentifier ?? ""

        // Use the PassKit async API
        Task { [weak self] in
          do {
            let controller = PKIdentityAuthorizationController()
            self?.activeController = controller
            let _ = try await controller.requestDocument(pkRequest)
            promise.resolve(true)
          } catch {
            promise.reject("REQUEST_FAILED", error.localizedDescription)
          }
        }
      } catch {
        promise.reject("ERR_REQUEST_BUILD", error.localizedDescription)
      }
    }
  }

  // MARK: - Helpers
  // ---------------------------------------------------------------------------

  /// Parse the JS request object into a PassKit `PKIdentityRequest`.
  private static func buildPKRequest(from js: [String: Any]) throws -> PKIdentityRequest? {
    var descriptors: [PKIdentityDocumentDescriptor] = []

    for (docKey, specAny) in js {
      guard let spec = specAny as? [String: Any],
            let elementItems = spec["elements"] as? [Any] else { continue }

      // 1. Descriptor per document type
      guard let kind = try? ExpoIdentityDocumentKind.convert(from: docKey, appContext: .init()),
            let descriptor = kind.descriptor else { continue }

      // 2. Per‑document intent (defaults to willNotStore)
      var intent: PKIdentityIntentToStore = .willNotStore
      if let intentDict = spec["intentToStore"] as? [String: Any] {
        intent = try PKIdentityIntentToStore.convert(from: intentDict, appContext: .init())
      }

      // 3. Elements (strings or {type:"ageAtLeast",threshold:n})
      let elements: [PKIdentityElement] = elementItems.compactMap { item in
        if let str = item as? String {
          return try? PKIdentityElement.convert(from: str, appContext: .init())
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

    // Combine descriptors as allowed by the OS version
    let request = PKIdentityRequest()
    if descriptors.count == 1 {
      request.descriptor = descriptors[0]
    } else {
      if #available(iOS 26.0, *) {
        request.descriptor = PKIdentityAnyOfDescriptor(descriptors: descriptors)
      } else {
        throw Exception(
          name: "ERR_MULTI_DOC_UNSUPPORTED",
          description: "Requesting multiple document types requires iOS 26 or newer.",
          code: "ERR_MULTI_DOC_UNSUPPORTED"
        )
      }
    }
    return request
  }
}
