# Local `act` runner image for scripts/github.sh.
#
# Based on the image act uses by default so all the GitHub Actions plumbing
# (node for JS actions, sudo, the runner toolcache layout) keeps working. We
# only add the two binaries the deploy workflow needs so local runs skip the
# "Install AWS CLI for local act runs" step.
FROM catthehacker/ubuntu:act-latest

ARG TERRAFORM_VERSION=1.10.0
# Populated automatically by BuildKit; the default keeps plain `docker build` working.
ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        unzip; \
    rm -rf /var/lib/apt/lists/*

# AWS CLI v2 via the official installer.
#
# Do NOT use `pip3 install awscli`: on Ubuntu 24.04 PEP 668 marks the system
# interpreter externally-managed and pip refuses to install into it, which is
# what broke the previous version of this image.
RUN set -eux; \
    case "${TARGETARCH}" in \
        amd64) awscli_arch=x86_64 ;; \
        arm64) awscli_arch=aarch64 ;; \
        *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${awscli_arch}.zip" -o /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install --update; \
    rm -rf /tmp/awscliv2.zip /tmp/aws; \
    aws --version

# Terraform, pinned to the version the workflow's setup-terraform step requests.
RUN set -eux; \
    curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TARGETARCH}.zip" \
        -o /tmp/terraform.zip; \
    unzip -q /tmp/terraform.zip -d /usr/local/bin; \
    rm -f /tmp/terraform.zip; \
    chmod +x /usr/local/bin/terraform; \
    terraform version
