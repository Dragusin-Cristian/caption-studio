FROM public.ecr.aws/lambda/nodejs:20-x86_64 AS builder

RUN dnf install -y gcc gcc-c++ make cmake git tar gzip which

WORKDIR /build
RUN git clone --depth=1 https://github.com/ggerganov/whisper.cpp.git
WORKDIR /build/whisper.cpp
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
 && cmake --build build -j --config Release
RUN bash ./models/download-ggml-model.sh base \
 && QUANT=$(ls build/bin/quantize build/bin/whisper-quantize 2>/dev/null | head -1) \
 && "$QUANT" ./models/ggml-base.bin ./models/ggml-base-q8_0.bin q8_0 \
 && rm ./models/ggml-base.bin

FROM public.ecr.aws/lambda/nodejs:20-x86_64

RUN dnf install -y libgomp && dnf clean all

COPY --from=builder /build/whisper.cpp/build/bin/whisper-cli /opt/whisper/whisper-cli
COPY --from=builder /build/whisper.cpp/models/ggml-base-q8_0.bin /opt/whisper/model.bin

COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev

COPY dist/ ${LAMBDA_TASK_ROOT}/

CMD ["lambda/worker.handler"]
