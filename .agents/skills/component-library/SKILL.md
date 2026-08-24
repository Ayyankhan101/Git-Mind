---
name: component-library
description: "Build scalable component libraries with consistent APIs, design tokens, and composition patterns. This skill covers component architecture, prop design, compound components, render props, slots, variant systems, and documentation. Use it whenever the user mentions component library, design system, UI kit, component architecture, component API, or building reusable components. Trigger even when the user doesn't say 'component library' but describes system-level needs: 'build a button that works everywhere', 'create a consistent set of form components', 'make components composable'. Also when discussing component variants, compound components, or component documentation."
---

# Component Library Skill

## Core Principles

1. **Composition over configuration** — Small pieces that combine, not mega-components
2. **Consistent API** — Same prop patterns across all components
3. **Design tokens** — All values from a central source
4. **Accessible by default** — ARIA, keyboard nav, focus management built in
5. **Tree-shakeable** — Import only what you use

## Component Architecture

### Atomic Design Levels

```
Atoms      → Button, Input, Label, Icon
Molecules  → SearchInput, FormField, Tooltip
Organisms  → Header, Sidebar, CardGrid
Templates  → PageLayout, DashboardLayout
Pages      → HomePage, SettingsPage
```

### File Structure

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.stories.tsx
│   │   ├── index.ts
│   │   └── styles.module.css
│   ├── Input/
│   │   ├── Input.tsx
│   │   └── ...
│   └── index.ts          # Barrel export
├── tokens/
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   └── index.ts
└── styles/
    ├── globals.css
    └── reset.css
```

## Design Tokens

### Token Structure

```typescript
// tokens/colors.ts
export const colors = {
  // Primitive values
  blue: {
    50: 'oklch(95% 0.05 260)',
    100: 'oklch(90% 0.08 260)',
    500: 'oklch(50% 0.20 260)',
    600: 'oklch(42% 0.20 260)',
  },

  // Semantic tokens (reference primitives)
  primary: {
    default: 'var(--color-blue-500)',
    hover: 'var(--color-blue-600)',
  },

  // Component tokens (reference semantics)
  button: {
    primary: 'var(--color-primary-default)',
    text: 'var(--color-gray-900)',
  },
};
```

### Spacing Tokens

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;    /* 4px */
  --space-2: 0.5rem;     /* 8px */
  --space-3: 0.75rem;    /* 12px */
  --space-4: 1rem;       /* 16px */
  --space-5: 1.5rem;     /* 24px */
  --space-6: 2rem;       /* 32px */
  --space-8: 3rem;       /* 48px */
  --space-10: 4rem;      /* 64px */
  --space-12: 6rem;      /* 96px */
}
```

### Typography Tokens

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1rem + 1.25vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1rem + 2.5vw, 2.25rem);

  --leading-tight: 1.1;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
}
```

## Prop API Patterns

### Consistent Size Prop

```typescript
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  size?: Size;        // Default: 'md'
  // ...
}

// All components use same size names
interface InputProps {
  size?: Size;
}

interface SelectProps {
  size?: Size;
}
```

### Variant Prop

```typescript
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  variant?: Variant;  // Default: 'primary'
}

// CSS implementation
.button[data-variant="primary"] {
  background: var(--color-primary);
  color: white;
}

.button[data-variant="secondary"] {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.button[data-variant="ghost"] {
  background: transparent;
  color: var(--color-text);
}

.button[data-variant="danger"] {
  background: var(--color-error);
  color: white;
}
```

### Compound Variants

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary';
  size: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

// Handle all combinations in CSS
.button[data-variant="primary"][data-size="sm"] {
  padding: 0.375rem 0.75rem;
  font-size: var(--text-sm);
}

.button[data-variant="primary"][data-size="md"] {
  padding: 0.5rem 1rem;
  font-size: var(--text-base);
}

.button[data-fullwidth="true"] {
  width: 100%;
}
```

## Compound Components

### Pattern

```tsx
// Compound component structure
<Select>
  <Select.Trigger>Choose an option</Select.Trigger>
  <Select.Content>
    <Select.Item value="1">Option 1</Select.Item>
    <Select.Item value="2">Option 2</Select.Item>
    <Select.Item value="3">Option 3</Select.Item>
  </Select.Content>
</Select>
```

### Implementation

```tsx
import { createContext, useContext, useState } from 'react';

const SelectContext = createContext(null);

function Select({ children, value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <SelectContext.Provider value={{ value, onChange, open, setOpen }}>
      <div className="select">{children}</div>
    </SelectContext.Provider>
  );
}

Select.Trigger = function Trigger({ children }) {
  const { open, setOpen } = useContext(SelectContext);
  return (
    <button
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen(!open)}
    >
      {children}
    </button>
  );
};

Select.Content = function Content({ children }) {
  const { open } = useContext(SelectContext);
  if (!open) return null;
  return (
    <ul role="listbox" className="select-content">
      {children}
    </ul>
  );
};

Select.Item = function Item({ value, children }) {
  const { value: selected, onChange, setOpen } = useContext(SelectContext);
  return (
    <li
      role="option"
      aria-selected={selected === value}
      onClick={() => {
        onChange(value);
        setOpen(false);
      }}
    >
      {children}
    </li>
  );
};
```

## Slot Pattern

### When to Use Slots

```tsx
// ❌ Configuration explosion
<Card
  header={<CardHeader title="Title" />}
  body={<CardBody>Content</CardBody>}
  footer={<CardFooter><Button>Save</Button></CardFooter>}
/>

// ✅ Composition with slots
<Card>
  <Card.Header>
    <h3>Title</h3>
  </Card.Header>
  <Card.Body>
    <p>Content</p>
  </Card.Body>
  <Card.Footer>
    <Button>Save</Button>
  </Card.Footer>
</Card>

// ✅ Or simpler: just children
<Card
  header={<h3>Title</h3>}
  footer={<Button>Save</Button>}
>
  <p>Content</p>
</Card>
```

## Form Components

### FormField Pattern

```tsx
function FormField({ label, error, hint, required, children, id }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>

      {hint && <span id={hintId} className="hint">{hint}</span>}

      {React.cloneElement(children, {
        id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? 'true' : 'false',
        'aria-required': required || undefined,
      })}

      {error && (
        <span id={errorId} role="alert" className="error">
          {error}
        </span>
      )}
    </div>
  );
}

// Usage
<FormField label="Email" id="email" required error="Invalid email">
  <Input type="email" />
</FormField>
```

## Button Component (Full Example)

```tsx
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        data-variant={variant}
        data-size={size}
        data-fullwidth={fullWidth || undefined}
        data-loading={loading || undefined}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`button ${className || ''}`}
        {...props}
      >
        {loading && <span className="spinner" aria-hidden="true" />}
        {leftIcon && <span className="button-icon" aria-hidden="true">{leftIcon}</span>}
        <span className={loading ? 'sr-only' : undefined}>{children}</span>
        {rightIcon && <span className="button-icon" aria-hidden="true">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

## Documentation

### Component Documentation Template

```markdown
## Button

A clickable element for triggering actions.

### Import

\`\`\`tsx
import { Button } from '@yourlib/ui';
\`\`\`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | 'primary' \| 'secondary' \| 'ghost' \| 'danger' | 'primary' | Visual style |
| size | 'sm' \| 'md' \| 'lg' | 'md' | Button size |
| fullWidth | boolean | false | Full container width |
| loading | boolean | false | Show loading spinner |
| disabled | boolean | false | Disabled state |

### Usage

\`\`\`tsx
<Button variant="primary" size="lg">
  Save changes
\`\`\`

### Accessibility

- Uses native `<button>` element
- Focus visible indicator
- Disabled state prevents interaction
- Loading state announced via `aria-busy`
```

## Common Anti-Patterns

1. **Mega-components** — `<Card>` with 20+ props instead of composition
2. **Inconsistent APIs** — `size="large"` vs `size="lg"` vs `big={true}`
3. **No tokens** — Hardcoded colors and spacing in components
4. **Missing a11y** — No ARIA, no keyboard nav, no focus management
5. **Tight coupling** — Components depend on specific data shapes
6. **No variants** — One-size-fits-all components
7. **Prop drilling** — Passing props through many layers
8. **No documentation** — Components exist but nobody knows how to use them

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
