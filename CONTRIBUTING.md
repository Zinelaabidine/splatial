# Contributing to Splatial

Thanks for your interest in contributing. This guide covers how to propose changes and the standards we hold across the codebase.

## Before You Start

- Open an [issue](https://github.com/Zinelaabidine/splatial/issues) before submitting significant changes so scope and approach can be discussed.
- Read [`CLAUDE.md`](CLAUDE.md) — it defines the engineering standards and architectural contract for the project.
- Review [`docs/ARCHITECTURE_REFERENCE.md`](docs/ARCHITECTURE_REFERENCE.md) for the as-built system design.

## Development Workflow

1. Fork the repository.
2. Create a feature branch from `dev`:
   ```bash
   git checkout dev
   git checkout -b feat/your-feature
   ```
3. Make your changes, following the standards below.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `docs`, `chore`, etc.).
5. Push and open a pull request against `dev`.

## Branch-to-Environment Mapping

| Branch    | Environment | Terraform Root       |
| --------- | ----------- | -------------------- |
| `dev`     | Development | `infra/envs/dev`     |
| `staging` | Staging     | `infra/envs/staging` |
| `main`    | Production  | `infra/envs/prod`    |

Always target `dev`. Promotion to `staging` and `main` happens through the deployment pipeline.

## Standards

### Infrastructure (Terraform)

- Run `terraform fmt -recursive` and `terraform validate` before committing.
- Keep resources least-privilege; scope IAM policies to specific resource ARNs.
- No hardcoded account IDs or secrets — use variables, data sources, and remote state outputs.

### Application Code

- **Frontend (Next.js / TypeScript):** run `npm run lint` and `npm run build` locally before opening a PR.
- **Worker (Python):** keep the SQS consumer idempotent and handle Spot interruption paths.
- **Lambda (Node.js):** keep handlers small and single-purpose.

### Secrets & Security

- Never commit `.env*` files, `.pem` keys, `.tfvars`, or state files — these are gitignored for a reason.
- Report security concerns per [`SECURITY.md`](SECURITY.md) rather than opening a public issue.

## Pull Request Checklist

- [ ] Linked to a relevant issue
- [ ] Conventional commit messages
- [ ] `terraform fmt` / `validate` pass (for infra changes)
- [ ] Lint and build pass (for frontend changes)
- [ ] No secrets, keys, or build artifacts committed
- [ ] Documentation updated if behavior changed
