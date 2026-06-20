.PHONY: deploy build-client build-backend cdk-deploy

deploy: build-client build-backend cdk-deploy-all

deploy-client: build-client cdk-deploy-client

deploy-backend: build-backend cdk-deploy-backend

# ============================

build-client:
	echo "BUILD CLIENT" && cd client && npm run build

build-backend:
	echo "BUILD BACKEND" && cd backend && npm run build

cdk-deploy-all:
	echo "DEPLOY INFRA" && cd infra && npx cdk deploy --all

cdk-deploy-backend:
	echo "DEPLOY BACKEND" && cd infra && npx cdk deploy CaptionStudioBackend

cdk-deploy-client:
	echo "DEPLOY FRONTEND" && cd infra && npx cdk deploy CaptionStudioClient
