use korrid::{
    MoonlightCertificateAttestRequest, MoonlightCertificateProvisionRequest,
    MoonlightCertificateRevokeRequest, RpcRequest,
};

const CLIENT_PEM: &str = "-----BEGIN CERTIFICATE-----\nclient-secret\n-----END CERTIFICATE-----\n";

#[test]
fn moonlight_certificate_rpc_is_closed_tagged_and_redacted() {
    let cases = [
        (
            RpcRequest::MoonlightCertificateAttest(MoonlightCertificateAttestRequest {
                host_uuid: "sunshine-host".into(),
            }),
            "app.moonlight.certificate.attest",
        ),
        (
            RpcRequest::MoonlightCertificateProvision(MoonlightCertificateProvisionRequest {
                host_uuid: "sunshine-host".into(),
                client_certificate: CLIENT_PEM.into(),
            }),
            "app.moonlight.certificate.provision",
        ),
        (
            RpcRequest::MoonlightCertificateRevoke(MoonlightCertificateRevokeRequest {
                host_uuid: "sunshine-host".into(),
                client_certificate: CLIENT_PEM.into(),
            }),
            "app.moonlight.certificate.revoke",
        ),
    ];
    for (request, tag) in cases {
        let encoded = serde_json::to_value(&request).unwrap();
        assert_eq!(encoded["_tag"], tag);
        assert_eq!(encoded["payload"]["hostUuid"], "sunshine-host");
        assert!(!format!("{request:?}").contains("client-secret"));
    }
}
