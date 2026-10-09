from engine.kernel.security import decode_token, hash_password, sign_token, verify_password


def test_password_roundtrip():
    stored = hash_password("s3cret-pass")
    assert stored != "s3cret-pass"
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert not verify_password("s3cret-pass", "garbage")
    # salts differ per hash
    assert hash_password("same") != hash_password("same")


def test_token_roundtrip():
    token = sign_token({"sub": "user-1", "role": "ADMIN"}, "topsecret")
    payload = decode_token(token, "topsecret")
    assert payload["sub"] == "user-1"
    assert payload["role"] == "ADMIN"
    assert payload["exp"] > 0


def test_token_forgery_and_expiry():
    token = sign_token({"sub": "user-1", "role": "USER"}, "topsecret")
    assert decode_token(token, "othersecret") is None
    forged = token[:-4] + "AAAA"
    assert decode_token(forged, "topsecret") is None
    expired = sign_token({"sub": "user-1", "role": "USER"}, "topsecret", ttl_seconds=-10)
    assert decode_token(expired, "topsecret") is None
    assert decode_token("not.a.token", "topsecret") is None