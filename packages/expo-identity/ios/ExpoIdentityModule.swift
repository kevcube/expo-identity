import ExpoModulesCore
import PassKit
import UIKit

private struct IdentityModuleError: Error {
  let code: String
  let message: String
}

@available(iOS 16.4, *)
public final class ExpoIdentityModule: Module {
  private var activeController: PKIdentityAuthorizationController?

  public func definition() -> ModuleDefinition {
    Name("ExpoIdentity")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      let protocols = UIDevice.current.userInterfaceIdiom == .phone
        ? ["apple-wallet"]
        : []
      return ["protocols": protocols]
    }

    AsyncFunction("present") { (requestJson: String, promise: Promise) in
      DispatchQueue.main.async {
        guard self.activeController == nil else {
          promise.reject("REQUEST_IN_PROGRESS", "An identity request is already in progress.")
          return
        }

        do {
          let request = try Self.buildRequest(requestJson)
          guard let descriptor = request.descriptor else {
            throw IdentityModuleError(code: "INVALID_REQUEST", message: "The identity request has no document descriptor.")
          }
          let controller = PKIdentityAuthorizationController()
          self.activeController = controller

          Task { @MainActor in
            guard await controller.canRequestDocument(descriptor) else {
              self.activeController = nil
              promise.reject("UNAVAILABLE", "No eligible identity document is available.")
              return
            }

            controller.requestDocument(request) { document, error in
              DispatchQueue.main.async {
                self.activeController = nil
                if let document {
                  let credential: [String: Any] = [
                    "protocol": "apple-wallet",
                    "data": [
                      "encryptedData": Self.base64url(document.encryptedData)
                    ]
                  ]
                  do {
                    let data = try JSONSerialization.data(withJSONObject: credential)
                    promise.resolve(String(decoding: data, as: UTF8.self))
                  } catch {
                    promise.reject("INVALID_RESPONSE", "Wallet returned an invalid identity response.")
                  }
                  return
                }
                Self.reject(promise, passKitError: error)
              }
            }
          }
        } catch let error as IdentityModuleError {
          self.activeController = nil
          promise.reject(error.code, error.message)
        } catch {
          self.activeController = nil
          promise.reject("INVALID_REQUEST", "The identity request is malformed.")
        }
      }
    }
  }

  private static func buildRequest(_ requestJson: String) throws -> PKIdentityRequest {
    guard
      let jsonData = requestJson.data(using: .utf8),
      let request = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
      request["protocol"] as? String == "apple-wallet",
      let data = request["data"] as? [String: Any],
      let merchantIdentifier = data["merchantIdentifier"] as? String,
      !merchantIdentifier.isEmpty,
      let nonceValue = data["nonce"] as? String,
      let nonce = decodeBase64url(nonceValue),
      !nonce.isEmpty,
      nonce.count <= 64,
      let document = data["document"] as? [String: Any],
      let kind = document["kind"] as? String,
      let requestedElements = document["elements"] as? [[String: Any]],
      !requestedElements.isEmpty
    else {
      throw IdentityModuleError(code: "INVALID_REQUEST", message: "The Apple Wallet request is malformed.")
    }

    let descriptor = try documentDescriptor(kind)
    var transientElements: [PKIdentityElement] = []
    var retainedElements: [Int: [PKIdentityElement]] = [:]
    for item in requestedElements {
      guard
        let elementValue = item["element"],
        let retain = item["retain"] as? Bool
      else {
        throw IdentityModuleError(code: "INVALID_REQUEST", message: "An Apple Wallet element is malformed.")
      }
      let element = try identityElement(elementValue)
      if retain {
        guard let days = item["retentionDays"] as? Int, days > 0 else {
          throw IdentityModuleError(code: "INVALID_REQUEST", message: "A retained Apple Wallet element requires retentionDays.")
        }
        retainedElements[days, default: []].append(element)
      } else {
        transientElements.append(element)
      }
    }
    if !transientElements.isEmpty {
      descriptor.addElements(transientElements, intentToStore: .willNotStore)
    }
    for (days, elements) in retainedElements {
      descriptor.addElements(elements, intentToStore: .mayStore(days: days))
    }

    let identityRequest = PKIdentityRequest()
    identityRequest.descriptor = descriptor
    identityRequest.nonce = nonce
    identityRequest.merchantIdentifier = merchantIdentifier
    return identityRequest
  }

  private static func documentDescriptor(_ kind: String) throws -> PKIdentityDocumentDescriptor {
    switch kind {
    case "driversLicense":
      return PKIdentityDriversLicenseDescriptor()
    case "nationalIDCard":
      guard #available(iOS 18.0, *) else {
        throw IdentityModuleError(code: "UNAVAILABLE", message: "National ID presentation requires iOS 18 or later.")
      }
      return PKIdentityNationalIDCardDescriptor()
    case "photoID":
      guard #available(iOS 26.0, *) else {
        throw IdentityModuleError(code: "UNAVAILABLE", message: "Photo ID presentation requires iOS 26 or later.")
      }
      return PKIdentityPhotoIDDescriptor()
    default:
      throw IdentityModuleError(code: "INVALID_REQUEST", message: "The Apple Wallet document kind is invalid.")
    }
  }

  private static func identityElement(_ value: Any) throws -> PKIdentityElement {
    if let value = value as? [String: Any] {
      guard
        let ageAtLeast = value["ageAtLeast"] as? Int,
        (0...150).contains(ageAtLeast)
      else {
        throw IdentityModuleError(code: "INVALID_REQUEST", message: "The Apple Wallet age threshold is invalid.")
      }
      return .age(atLeast: ageAtLeast)
    }
    guard let value = value as? String else {
      throw IdentityModuleError(code: "INVALID_REQUEST", message: "The Apple Wallet element is invalid.")
    }

    switch value {
    case "givenName": return .givenName
    case "familyName": return .familyName
    case "portrait": return .portrait
    case "address": return .address
    case "documentNumber": return .documentNumber
    case "dateOfBirth": return .dateOfBirth
    case "age": return .age
    case "issuingAuthority": return .issuingAuthority
    case "documentExpirationDate": return .documentExpirationDate
    case "documentIssueDate": return .documentIssueDate
    case "drivingPrivileges": return .drivingPrivileges
    case "sex":
      guard #available(iOS 17.2, *) else { return try unavailableElement(value, version: "17.2") }
      return .sex
    case "documentDHSComplianceStatus":
      guard #available(iOS 17.2, *) else { return try unavailableElement(value, version: "17.2") }
      return .documentDHSComplianceStatus
    case "eyeColor":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .eyeColor
    case "hairColor":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .hairColor
    case "height":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .height
    case "weight":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .weight
    case "organDonorStatus":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .organDonorStatus
    case "veteranStatus":
      guard #available(iOS 26.0, *) else { return try unavailableElement(value, version: "26") }
      return .veteranStatus
    case "nationality":
      guard #available(iOS 26.4, *) else { return try unavailableElement(value, version: "26.4") }
      return .nationality
    case "placeOfBirth":
      guard #available(iOS 26.4, *) else { return try unavailableElement(value, version: "26.4") }
      return .placeOfBirth
    case "signatureUsualMark":
      guard #available(iOS 26.4, *) else { return try unavailableElement(value, version: "26.4") }
      return .signatureUsualMark
    case "dhsTemporaryLawfulStatus":
      guard #available(iOS 26.4, *) else { return try unavailableElement(value, version: "26.4") }
      return .dhsTemporaryLawfulStatus
    case "name":
      guard #available(iOS 27.0, *) else { return try unavailableElement(value, version: "27") }
      return .name
    default:
      throw IdentityModuleError(code: "INVALID_REQUEST", message: "The Apple Wallet element \(value) is invalid.")
    }
  }

  private static func unavailableElement(_ element: String, version: String) throws -> PKIdentityElement {
    throw IdentityModuleError(code: "UNAVAILABLE", message: "\(element) requires iOS \(version) or later.")
  }

  private static func decodeBase64url(_ value: String) -> Data? {
    var encoded = value.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    return Data(base64Encoded: encoded)
  }

  private static func base64url(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func reject(_ promise: Promise, passKitError error: Error?) {
    guard let error = error as NSError? else {
      promise.reject("UNAVAILABLE", "Wallet did not return an identity document.")
      return
    }
    guard error.domain == PKIdentityErrorDomain,
          let code = PKIdentityError.Code(rawValue: error.code) else {
      promise.reject("UNAVAILABLE", error.localizedDescription)
      return
    }
    switch code {
    case .cancelled:
      promise.reject("CANCELLED", "Identity presentation was cancelled.")
    case .requestAlreadyInProgress:
      promise.reject("REQUEST_IN_PROGRESS", "An identity request is already in progress.")
    case .networkUnavailable:
      promise.reject("NETWORK_ERROR", "The network is unavailable.")
    case .noElementsRequested, .invalidNonce, .invalidElement, .regionNotSupported:
      promise.reject("INVALID_REQUEST", error.localizedDescription)
    case .notSupported:
      promise.reject("UNAVAILABLE", error.localizedDescription)
    case .unknown:
      promise.reject("UNAVAILABLE", error.localizedDescription)
    @unknown default:
      promise.reject("UNAVAILABLE", error.localizedDescription)
    }
  }
}
