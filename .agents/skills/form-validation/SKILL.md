---
name: form-validation
description: "Build forms that feel helpful, not hostile. This skill covers validation patterns, error messaging, inline validation, accessibility (aria), loading states, and form UX best practices. Use it whenever the user mentions forms, validation, form errors, input validation, form UX, form design, or form accessibility. Trigger even when the user doesn't say 'form validation' but describes form-related needs: 'the form keeps rejecting valid input', 'errors are confusing', 'make the form more user-friendly', 'add validation to this form'. Also when discussing email validation, password strength, multi-step forms, or form submission flows."
---

# Form Validation Skill

## Core Principles

1. **Help, don't block** — Guide users to correct input, don't punish mistakes
2. **Inline validation** — Validate on blur, not on every keystroke
3. **Clear messages** — Say what's wrong AND how to fix it
4. **Accessible errors** — Announced to screen readers, visible focus management
5. **Progressive** — Start simple, add complexity as needed

## Validation Timing

```javascript
// ❌ Validate on every keystroke (annoying)
input.addEventListener('input', validate);

// ❌ Validate only on submit (too late)
form.addEventListener('submit', validateAll);

// ✅ Validate on blur (when user leaves field)
input.addEventListener('blur', validate);

// ✅ Validate on submit (catch anything missed)
form.addEventListener('submit', (e) => {
  if (!validateAll()) e.preventDefault();
});

// ✅ After first error, validate on input (real-time feedback)
input.addEventListener('blur', () => {
  input.dataset.touched = 'true';
});
input.addEventListener('input', () => {
  if (input.dataset.touched) validate(input);
});
```

## Error Messaging

### Message Structure

```html
<!-- ❌ Vague -->
<span class="error">Invalid input</span>

<!-- ✅ Specific and helpful -->
<span class="error" role="alert">
  Please enter a valid email address (e.g., name@example.com)
</span>

<!-- ✅ With character count -->
<input maxlength="160" aria-describedby="char-count" />
<span id="char-count">47/160 characters</span>
```

### Message Patterns

| Field | Bad Message | Good Message |
|-------|-------------|--------------|
| Email | "Invalid email" | "Please enter a valid email (e.g., name@example.com)" |
| Password | "Too short" | "Password must be at least 8 characters" |
| Name | "Required" | "Please enter your name" |
| Phone | "Invalid phone" | "Please enter a valid phone number (e.g., +1 555 123 4567)" |
| Username | "Taken" | "This username is already taken. Try another." |
| URL | "Invalid URL" | "Please enter a valid URL (e.g., https://example.com)" |

### Character Count

```javascript
function updateCharCount(input, counter, max) {
  const remaining = max - input.value.length;
  counter.textContent = `${input.value.length}/${max}`;
  counter.classList.toggle('warning', remaining < 20);
  counter.classList.toggle('error', remaining < 0);
  input.setAttribute('aria-invalid', remaining < 0);
}
```

## Validation Patterns

### Email

```javascript
// ❌ Overly strict regex
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// ✅ Reasonable check (HTML5 handles the rest)
function isValidEmail(email) {
  return email.includes('@') && email.includes('.') && email.length > 5;
}
```

```html
<!-- Use HTML5 built-in validation -->
<input type="email" required placeholder="name@example.com" />
```

### Password

```javascript
function validatePassword(password) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
  return checks;
}

// Visual feedback
function renderPasswordStrength(checks) {
  const passed = Object.values(checks).filter(Boolean).length;
  return `
    <div class="password-strength" role="status" aria-live="polite">
      <div class="strength-bar" style="width: ${(passed / 5) * 100}%"></div>
      <span class="strength-label">
        ${passed <= 2 ? 'Weak' : passed <= 4 ? 'Good' : 'Strong'}
      </span>
    </div>
  `;
}
```

### Phone Number

```javascript
// ✅ Flexible phone validation
function isValidPhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  return /^\+?[1-9]\d{6,14}$/.test(cleaned);
}
```

### Required Fields

```html
<!-- ✅ HTML5 required with custom message -->
<input required aria-required="true" />

<!-- ✅ Custom validation message -->
<input
  required
  aria-describedby="name-error"
  aria-invalid="false"
/>
<span id="name-error" role="alert" class="error"></span>
```

## Accessible Forms

### ARIA Attributes

```html
<form novalidate>
  <div class="field">
    <label for="email">Email address</label>
    <input
      id="email"
      type="email"
      required
      aria-required="true"
      aria-describedby="email-hint email-error"
      aria-invalid="false"
    />
    <span id="email-hint" class="hint">We'll never share your email</span>
    <span id="email-error" class="error" role="alert"></span>
  </div>
</form>
```

### Error Announcements

```javascript
function showError(input, message) {
  const errorEl = document.getElementById(`${input.id}-error`);
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');

  // Announce to screen readers
  errorEl.setAttribute('role', 'alert');

  // Move focus to first error
  input.focus();
}

function clearError(input) {
  const errorEl = document.getElementById(`${input.id}-error`);
  errorEl.textContent = '';
  input.setAttribute('aria-invalid', 'false');
}
```

### Focus Management

```javascript
// On submit, focus first error
function focusFirstError(form) {
  const firstError = form.querySelector('[aria-invalid="true"]');
  if (firstError) {
    firstError.focus();
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

## Visual Design

### Error States

```css
/* Input states */
.input {
  border: 1px solid var(--color-border);
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-focus);
  outline: none;
}

.input[aria-invalid="true"] {
  border-color: var(--color-error);
  box-shadow: 0 0 0 3px var(--color-error-focus);
}

/* Error message */
.error {
  color: var(--color-error);
  font-size: var(--text-sm);
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.error::before {
  content: "⚠";
  font-size: 0.875em;
}

/* Success state */
.input[aria-invalid="false"] {
  border-color: var(--color-success);
}

.success {
  color: var(--color-success);
  font-size: var(--text-sm);
  margin-top: 0.25rem;
}

.success::before {
  content: "✓";
}
```

### Hint Text

```css
.hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  margin-top: 0.25rem;
}

/* Hide hint when error is shown */
.field:has([aria-invalid="true"]) .hint {
  display: none;
}
```

## Multi-Step Forms

```javascript
// Step navigation
function nextStep(currentStep) {
  if (!validateStep(currentStep)) return;

  document.getElementById(`step-${currentStep}`).classList.remove('active');
  document.getElementById(`step-${currentStep + 1}`).classList.add('active');

  // Update progress
  updateProgress(currentStep + 1);

  // Focus first input in new step
  const firstInput = document.querySelector(`#step-${currentStep + 1} input`);
  if (firstInput) firstInput.focus();
}

// Validate current step before proceeding
function validateStep(step) {
  const stepEl = document.getElementById(`step-${step}`);
  const inputs = stepEl.querySelectorAll('input, select, textarea');
  let valid = true;

  inputs.forEach(input => {
    if (!validateInput(input)) valid = false;
  });

  if (!valid) {
    focusFirstError(stepEl);
  }

  return valid;
}
```

### Progress Indicator

```html
<div class="progress" role="progressbar" aria-valuenow="2" aria-valuemin="1" aria-valuemax="4">
  <div class="progress-step completed">1. Personal Info</div>
  <div class="progress-step active">2. Address</div>
  <div class="progress-step">3. Payment</div>
  <div class="progress-step">4. Confirm</div>
</div>
```

## Loading States

```javascript
async function handleSubmit(e) {
  e.preventDefault();
  const button = form.querySelector('button[type="submit"]');

  // Disable and show loading
  button.disabled = true;
  button.innerHTML = `
    <svg class="spinner" aria-hidden="true">...</svg>
    Submitting...
  `;

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      body: new FormData(form),
    });

    if (!response.ok) throw new Error('Submission failed');

    // Show success
    showSuccess('Form submitted successfully!');
  } catch (error) {
    // Show error
    showError('Something went wrong. Please try again.');
    button.disabled = false;
    button.textContent = 'Submit';
  }
}
```

## Common Anti-Patterns

1. **Validate on every keystroke** — Annoying, blocks natural typing flow
2. **Vague error messages** — "Invalid input" doesn't help users fix the issue
3. **No ARIA attributes** — Screen readers can't announce errors
4. **Color-only error states** — Red border without text/icon (colorblind users)
5. **No focus management** — Errors appear but focus stays at bottom of form
6. **Clearing all errors on fix** — Only clear the specific field's error
7. **Blocking submit entirely** — Better to submit with warnings than block
8. **No loading state** — User clicks submit multiple times
9. **Client-only validation** — Always validate on server too
10. **Placeholder as label** — Placeholder disappears on focus, label stays

## Framework Notes

### React Hook Form

```jsx
import { useForm } from 'react-hook-form';

function Form() {
  const { register, handleSubmit, formState: { errors } } = useForm();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Please enter a valid email',
            },
          })}
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <span id="email-error" className="error" role="alert">
            {errors.email.message}
          </span>
        )}
      </div>
    </form>
  );
}
```

### Svelte

```svelte
<script>
  let email = '';
  let emailError = '';

  function validateEmail() {
    if (!email) {
      emailError = 'Email is required';
    } else if (!email.includes('@')) {
      emailError = 'Please enter a valid email';
    } else {
      emailError = '';
    }
  }
</script>

<div class="field">
  <label for="email">Email</label>
  <input
    id="email"
    type="email"
    bind:value={email}
    on:blur={validateEmail}
    aria-invalid={emailError ? 'true' : 'false'}
    aria-describedby="email-error"
  />
  {#if emailError}
    <span id="email-error" class="error" role="alert">
      {emailError}
    </span>
  {/if}
</div>
```

### HTML5 Native

```html
<!-- Use built-in validation when possible -->
<form>
  <input type="email" required placeholder="name@example.com" />
  <input type="password" minlength="8" required />
  <input type="text" pattern="[A-Za-z]{3,}" required />
  <button type="submit">Submit</button>
</form>

<style>
  /* Style validation states */
  input:invalid:not(:placeholder-shown) {
    border-color: var(--color-error);
  }
  input:valid:not(:placeholder-shown) {
    border-color: var(--color-success);
  }
</style>
```

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
