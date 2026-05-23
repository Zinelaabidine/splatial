# Splatial — Global Copilot Instructions

## Project Identity

**Splatial** is a high-performance 3D Gaussian Splatting media pipeline deployed on AWS.

| Layer | Technology | Location |
|---|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui, AWS Amplify | `site/my-app/` |
| API & Upload | Node.js 18.x Lambda handlers, AWS SDK v3, multipart S3 | `infra/modules/static-site/src-upload/` |
| Infrastructure | Terraform 1.5+, AWS Provider v5.x, modular design | `infra/modules/`, `infra/envs/` |
| Auth | Cognito User Pool, JWT via API Gateway native authorizer | — |
| Storage | S3 (raw scenes + Transfer Acceleration), DynamoDB (scene state) | — |
| Distribution | CloudFront, Route 53, ACM wildcard cert | — |
| GPU Training | EC2 G4dn/G5 Spot ASG, SQS job queue, S3 checkpointing | — |

**Primary data flow:** Browser upload (.ply / .splat / .spz / video / images) → S3 multipart → DynamoDB `PENDING_UPLOAD` → SQS → EC2 Spot GPU worker (Gaussian Splatting training) → processed `.splat` output → CloudFront viewer.

---

## Agentic Behavior Rules

1. **No filler.** Output only what was asked. No greetings, apologies, sign-offs, or meta-commentary.
2. **Plan before code.** For any non-trivial change, produce a bullet-point architecture plan first. Do not write code until the plan is confirmed. Exception: single-file, clearly-scoped edits.
3. **One concern per response.** Address the exact scope of the request. Do not refactor adjacent code, add docstrings, or improve unrelated logic unless explicitly asked.
4. **Error analysis.** When fed a stack trace or error log via `#terminalLastCommand`, state the root cause in one sentence, then provide the fix. Do not apologize.
5. **Security by default.** Every artifact must follow least-privilege IAM, private-by-default S3, input validation at all Lambda entry points, and no secrets in code. Flag any generated code that deviates and explain why.
6. **No placeholders.** Never output `# TODO`, `"REPLACE_ME"`, or `# add other resources here`. Every block must be complete and deployable.

---

## Git & PR Workflow

### Commit Messages
Use [Conventional Commits](https://www.conventionalcommits.org/). Scope must reflect the domain of the change:

| Scope | When to use |
|---|---|
| `feat(upload):` | New multipart upload capability |
| `feat(splat-stream):` | New Gaussian splat streaming or processing feature |
| `feat(infra):` | New Terraform resource or module |
| `feat(frontend):` | New Next.js component, page, or hook |
| `fix(s3-cors):` | S3 CORS policy correction |
| `fix(auth):` | Cognito / JWT / Amplify fix |
| `fix(backend):` | Lambda handler bug fix |
| `refactor(lambda):` | Internal restructure with no behavior change |
| `chore(infra):` | `terraform fmt`, version bumps, comments |

Subject line: ≤ 50 characters, imperative mood, no trailing period.

### PR Descriptions
Use this structure:
1. **Objective:** What does this PR do?
2. **Architecture Changes:** Which files and AWS resources changed?
3. **Testing:** Which commands were run and what was verified?

---

## Phase-Based Output & Post-Execution Rules

After **every** code generation or modification, append the following section:

```
---
### Proposed Commit Message
<type>(<scope>): <subject>

### Verification Checklist
- [ ] <step 1 — specific command or manual check>
- [ ] <step 2>
- [ ] <step 3 if applicable>
```

The checklist must be **tailored to the change**, not generic. Examples by domain:
- **Lambda handler change:** `node -e "require('./upload')"` for syntax check + `aws logs tail /aws/lambda/<name> --follow`
- **Frontend change:** `cd site/my-app && npm run build` → zero TypeScript errors + visual check in browser
- **Terraform change:** `cd infra/envs/<env> && terraform fmt -recursive && terraform validate && terraform plan`
- **IAM policy change:** Review `plan` output for any `"*"` in `actions` or `resources`; run `aws iam simulate-principal-policy` on critical paths

---

## Documentation

- Document the **why**, not the **what**. Assume the reader is a Senior AWS/DevOps engineer or 3D graphics developer.
- Keep READMEs concise. Do not add prose that restates the code.
- Inline comments are for non-obvious decisions only (e.g., cost rationale, AWS API quirks, security trade-offs).