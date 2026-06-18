FROM public.ecr.aws/lambda/nodejs:20-x86_64

COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev

COPY dist/ ${LAMBDA_TASK_ROOT}/

CMD ["lambda/orchestrator.handler"]
