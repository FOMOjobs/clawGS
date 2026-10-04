# AI Control Layer - Architektura Systemu

## 1. Wzorzec Architektoniczny: LLM API Gateway
System został zaprojektowany jako **API Gateway** (Reverse Proxy). Klienci (Aplikacje, Agenty) komunikują się z naszym systemem używając standardowych formatów (np. OpenAI API). Gateway przechwytuje żądanie, aplikuje reguły bezpieczeństwa (Guardrails), sprawdza budżety, a następnie ruteruje zapytanie do odpowiedniego docelowego modelu LLM.

Dzięki temu nie są wymagane głębokie zmiany w kodzie po stronie klienta – wystarczy zmiana parametru `base_url`.

## 2. Główne Komponenty

### A. AI Gateway & Management API (Backend - Python / FastAPI)
Serce systemu wystawiające dwa niezależne interfejsy:

1. **LLM Gateway API (`/v1/chat/completions`)**
   - **Przeznaczenie:** Dla Agentów i Aplikacji.
   - **Autoryzacja:** API Keys (statyczne klucze generowane w systemie).
   - **Multi-Provider & Ruter:** Używa biblioteki (np. `litellm`), aby ujednolicić komunikację z różnymi dostawcami (OpenAI, Anthropic, Ollama, itp.).
   - **Funkcja Domyślnego Modelu:** Jeśli w payloadzie żądania (od Agenta) nie zostanie wskazany konkretny model, Gateway automatycznie przekieruje zapytanie do **Modelu Domyślnego**. Model domyślny jest konfigurowany przez administratorów w panelu WebUI.
   - **Guardrails:** 
     - *Przed wysłaniem (Pre-flight):* Walidacja budżetu, filtrowanie PII (Regex/DLP), weryfikacja pod kątem Prompt Injection (np. przy użyciu mniejszego, lokalnego modelu klasyfikującego).
     - *Po odebraniu (Post-flight):* Analiza odpowiedzi pod kątem wycieku danych.

2. **Management API (`/api/...`)**
   - **Przeznaczenie:** Dla aplikacji WebUI (Zarządzanie systemem).
   - **Autoryzacja:** OpenID Connect (OIDC) - walidacja tokenów JWT.
   - **Funkcje:** CRUD dla modeli, konfiguracja Guardrails, przydzielanie budżetów tokenów, pobieranie logów i statystyk.

### B. Dashboard / WebUI (Frontend)
- **Technologia:** Lekki framework frontendowy (np. React, Vue, lub oparte na Pythonie rozwiązanie wspierające OIDC).
- **Zastosowanie:** Interfejs dla Security Team i Managementu.
- **Funkcje:** 
  - Konfiguracja dostawców i modeli (w tym wybór Modelu Domyślnego).
  - Widok zużycia budżetów i zablokowanych interakcji (Security Posture).
  - Integracja z SSO (OpenID Connect).

### C. Baza Danych
- **Technologia:** SQLite (na potrzeby Hackathonu - lekka, wbudowana), gotowa do migracji na PostgreSQL (dzięki użyciu ORM, np. SQLAlchemy).
- **Przechowuje:**
  - Konfigurację dostawców, modeli (oraz flagę modelu domyślnego).
  - Zdefiniowane polityki (Guardrails).
  - Klucze API dla Agentów, powiązane z limitami (Budżety).
  - Logi z audytów i metryki zużycia.

### D. Identity Provider (OIDC SSO)
- **Technologia:** Dowolny dostawca OpenID Connect (np. Keycloak, Auth0, Google Workspace).
- **Zastosowanie:** Zapewnia bezpieczne logowanie użytkowników (ludzi) do panelu administracyjnego (WebUI) i zwraca tokeny JWT do autoryzacji w Management API.

---

## 3. Przepływ Informacji (Data Flow)

### Przepływ Zarządzania (SSO)
1. Administrator wchodzi na WebUI.
2. WebUI przekierowuje do dostawcy OIDC (logowanie SSO).
3. Po pomyślnym zalogowaniu, WebUI otrzymuje JWT.
4. WebUI wysyła żądanie do Management API (`/api/models`), dołączając JWT w nagłówku.
5. FastAPI weryfikuje JWT i zwraca/zapisuje dane konfiguracyjne (np. ustawienie domyślnego modelu).

### Przepływ Inferencji (Agent -> LLM)
1. Agent AI wysyła żądanie do `/v1/chat/completions` z użyciem swojego API Key (z parametrem `model` lub bez).
2. FastAPI autoryzuje Agenta po kluczu API.
3. System sprawdza, czy Agent określił model. Jeśli nie, ładuje z bazy zdefiniowany Model Domyślny.
4. Uruchamiane są Guardrails (np. Regex na PII, weryfikacja semantyczna u lokalnego strażnika).
5. Gateway aktualizuje licznik zapytań (limit budżetowy).
6. Gateway mapuje znormalizowane żądanie na odpowiednie API (np. OpenAI lub lokalna Ollama).
7. Po otrzymaniu odpowiedzi, system wykonuje walidację wyjściową.
8. Logi audytowe (zużycie tokenów, akcje blokowania) są zapisywane asynchronicznie do bazy.
9. Bezpieczna odpowiedź wraca do Agenta.