// Basic secret sanitization to prevent data leakage to AI models

const SECRET_PATTERNS = [
  // Generic API Keys or Tokens
  /(?:api_key|apikey|access_token|secret_key|client_secret|auth_token)\s*[:=]\s*["']?([A-Za-z0-9-_+]{16,})["']?/gi,
  
  // AWS Access Key ID
  /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
  
  // JSON Web Tokens (JWT)
  /ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
  
  // Stripe Standard API Keys
  /sk_live_[0-9a-zA-Z]{24}/g,
  
  // GitHub Personal Access Tokens (Classic and Fine-grained)
  /gh[p|o|u|s|r]_[A-Za-z0-9_]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  
  // Google / GCP API Keys
  /AIza[0-9A-Za-z\\-_]{35}/g,
  
  // Bearer tokens in headers or strings
  /Bearer\s+[A-Za-z0-9-_.+/=]+/gi
];

export function sanitizeSecrets(text: string): string {
  if (!text) return text;
  
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, p1) => {
      // If there's a capture group (like the generic pattern), replace just the secret part
      if (p1) {
        return match.replace(p1, "[REDACTED_SECRET]");
      }
      return "[REDACTED_SECRET]";
    });
  }
  return sanitized;
}
