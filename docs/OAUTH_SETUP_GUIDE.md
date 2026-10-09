# OAuth Setup Guide

## Mi LibreChat OAuth Configuration

This guide explains how to configure OAuth providers for Mi LibreChat.

---

## Table of Contents

1. [Google OAuth](#google-oauth)
2. [GitHub OAuth](#github-oauth)
3. [Discord OAuth](#discord-oauth)
4. [Azure AD OAuth](#azure-ad-oauth)
5. [Okta OAuth](#okta-oauth)
6. [LDAP/Active Directory](#ldapactive-directory)
7. [Environment Variables](#environment-variables)

---

## Google OAuth

### Step 1: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add Authorized Redirect URI:
   ```
   https://your-domain.com/api/auth/callback/google
   ```

### Step 2: Get Credentials

You will receive:
- **Client ID**
- **Client Secret**

### Step 3: Configure Environment

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Step 4: Optional Settings

```env
GOOGLE_SCOPES=openid,email,profile
GOOGLE_ALLOWED_DOMAINS=example.com,company.com
```

---

## GitHub OAuth

### Step 1: Create OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application Name**: LibreChat
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/api/auth/callback/github`

### Step 2: Get Credentials

Generate a new client secret and note:
- **Client ID** (shown on app page)
- **Client Secret**

### Step 3: Configure Environment

```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

### Step 4: Optional Settings

```env
GITHUB_SCOPES=read:user,user:email
GITHUB_ALLOW_SIGNUP=true
```

---

## Discord OAuth

### Step 1: Create Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Navigate to **OAuth2** → **General**
4. Add Redirect URL:
   ```
   https://your-domain.com/api/auth/callback/discord
   ```

### Step 2: Get Credentials

From the **OAuth2** page:
- Copy **Client ID**
- Reset/Generate **Client Secret**

### Step 3: Configure Environment

```env
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
```

---

## Azure AD OAuth

### Step 1: Register Application

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory**
2. Go to **App registrations** → **New registration**
3. Configure:
   - **Name**: LibreChat
   - **Supported account types**: Choose based on needs
   - **Redirect URI**: Web → `https://your-domain.com/api/auth/callback/azure_ad`

### Step 2: Get Credentials

1. Go to **Certificates & secrets** → **New client secret**
2. Note:
   - **Application (client) ID** (from Overview)
   - **Client Secret** (just created)
   - **Directory (tenant) ID** (from Overview)

### Step 3: Configure Environment

```env
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=your-tenant-id
```

### Step 4: Optional - Graph API Access

```env
AZURE_AD_SCOPES=openid,profile,email,User.Read
```

---

## Okta OAuth

### Step 1: Create Application

1. Log into your Okta Admin Console
2. Go to **Applications** → **Create App Integration**
3. Select **OIDC - OpenID Connect** → **Web Application**
4. Configure:
   - **Sign-in redirect URIs**: `https://your-domain.com/api/auth/callback/okta`
   - **Sign-out redirect URIs**: `https://your-domain.com`

### Step 2: Get Credentials

From the application settings:
- **Client ID**
- **Client Secret**
- **Okta Domain** (e.g., `your-org.okta.com`)

### Step 3: Configure Environment

```env
OKTA_CLIENT_ID=your-client-id
OKTA_CLIENT_SECRET=your-client-secret
OKTA_ISSUER=https://your-org.okta.com/oauth2/default
```

---

## LDAP/Active Directory

### Step 1: Enable LDAP

LDAP requires additional configuration in your server environment.

### Step 2: Configure Environment

```env
LDAP_URL=ldap://your-ldap-server:389
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=your-bind-password
LDAP_USER_SEARCH_BASE=ou=users,dc=example,dc=com
LDAP_USER_SEARCH_FILTER=(uid={{username}})
LDAP_GROUP_SEARCH_BASE=ou=groups,dc=example,dc=com
LDAP_GROUP_SEARCH_FILTER=(member={{dn}})
LDAP_TLS_ENABLED=true
```

### Step 3: Optional - Active Directory

```env
LDAP_USER_SEARCH_BASE=CN=Users,DC=example,DC=com
LDAP_USER_SEARCH_FILTER=(&(objectClass=user)(sAMAccountName={{username}}))
LDAP_ALLOW_UNFILTERED_UPLOADS=false
```

---

## Environment Variables

### Required

```env
# Enable OAuth
ALLOW_SOCIAL_LOGIN=true

# Session
SESSION_SECRET=your-random-session-secret
```

### Social Login Providers

```env
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Azure AD
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# Okta
OKTA_CLIENT_ID=
OKTA_CLIENT_SECRET=
OKTA_ISSUER=

# LDAP
LDAP_URL=
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=
LDAP_USER_SEARCH_BASE=
```

### Optional Configuration

```env
# OAuth General
OAUTH_CALLBACK_URL=https://your-domain.com/api/auth/callback
ALLOWED_OAUTH_DOMAINS=company.com,partner.com
OAUTH_PROVIDERS=google,github,discord

# Session
SESSION_EXPIRY=7d
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax

# Registration
ALLOW_NEW_ACCOUNTS=true
ALLOW_GUEST_LOGIN=false
REQUIRE_EMAIL_VERIFICATION=false
```

---

## Security Best Practices

### 1. Use HTTPS
Always use HTTPS in production to protect OAuth callbacks.

```env
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### 2. Secure Secrets
Never commit OAuth secrets to version control.

```env
# Use a secrets manager or .env file
# .env should be in .gitignore
```

### 3. Restrict Domains
Limit OAuth to specific email domains:

```env
GOOGLE_ALLOWED_DOMAINS=company.com,partner.com
```

### 4. Rate Limiting
Enable rate limiting for auth endpoints:

```env
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=20
```

### 5. Audit Logging
Enable authentication audit logging:

```env
LOG_AUTH_EVENTS=true
LOG_LEVEL=info
```

---

## Troubleshooting

### Common Issues

#### 1. Callback URL Mismatch
**Error**: `redirect_uri_mismatch`

**Solution**: Ensure callback URL exactly matches:
- Include protocol (https)
- No trailing slashes
- Same domain as configured

#### 2. Invalid Client Secret
**Error**: `invalid_client`

**Solution**: 
- Verify client secret is correct
- Check for extra spaces or characters
- Regenerate if necessary

#### 3. CORS Issues
**Error**: `CORS policy blocked`

**Solution**:
```env
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

#### 4. Session Issues
**Error**: Users getting logged out

**Solution**:
```env
SESSION_SECRET=long-random-secret-here
SESSION_EXPIRY=7d
```

### Debug Mode

Enable verbose logging for debugging:

```env
LOG_LEVEL=debug
DEBUG=auth:*
```

---

## Testing

### Test OAuth Flow

1. Clear browser cookies
2. Go to login page
3. Click OAuth provider button
4. Authorize application
5. Verify:
   - User created in database
   - Session established
   - Redirect to correct page

### Test Failures

```bash
# Check auth logs
tail -f logs/auth.log

# Check error logs
tail -f logs/error.log
```

---

## Production Checklist

- [ ] HTTPS configured
- [ ] OAuth credentials secure
- [ ] Session secret strong and random
- [ ] CORS configured for domain
- [ ] Rate limiting enabled
- [ ] Audit logging enabled
- [ ] Callback URLs verified
- [ ] Email verification if required
- [ ] Account creation restricted if needed
- [ ] LDAP secure connection (TLS)

---

## Resources

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/authorizing-oauth-apps)
- [Discord OAuth Documentation](https://discord.com/developers/docs/topics/oauth2)
- [Azure AD OAuth Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
- [Okta OAuth Documentation](https://developer.okta.com/docs/reference/api/oidc/)

---

*Document Version: 1.0.0*
*Last Updated: 2026-07-19*
