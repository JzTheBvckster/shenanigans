# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk-jammy

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libfreetype6 \
    libfontconfig1 \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Wrapper first so dependency download can be cached across source-only changes.
COPY --chmod=0755 mvnw ./mvnw
COPY .mvn/ ./.mvn/
COPY pom.xml ./pom.xml

RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw -B -DskipTests dependency:go-offline

COPY src/ ./src/

EXPOSE 8080

# Render sets PORT dynamically; default to 8080 for local Docker runs.
CMD ["sh", "-c", "./mvnw -B -DskipTests jpro:run -Djpro.host=0.0.0.0 -Djpro.port=${PORT:-8080}"]
