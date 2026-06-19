.PHONY: deploy build-client build-backend cdk-deploy

deploy: build-client build-backend cdk-deploy

build-client:
	echo "BUILD CLIENT" && cd client && npm run build

build-backend:
	echo "BUILD BACKEND" && cd backend && npm run build

cdk-deploy:
	echo "DEPLOY INFRA" && cd infra && npx cdk deploy CaptionStudio
