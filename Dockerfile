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

# Keep both Maven and the JPro app JVM within a 512 MB service budget.
ENV MAVEN_OPTS="-Xms16m -Xmx80m -XX:MaxMetaspaceSize=64m -XX:+UseSerialGC -Dhttps.protocols=TLSv1.2"
ENV JPRO_JVM_ARGS="-Xms16m,-Xmx128m,-XX:MaxMetaspaceSize=72m,-XX:+UseSerialGC,-XX:+ExitOnOutOfMemoryError"

# Render sets PORT dynamically; default to 8080 for local Docker runs.
# Use jpro:start so Maven exits after startup, reducing steady-state RAM usage.
CMD ["sh", "-c", "set -e; ./mvnw -B -DskipTests jpro:start \"-Djpro.port=${PORT:-8080}\" \"-Djpro.openURLOnStartup=false\" \"-Djpro.JVMArgs=${JPRO_JVM_ARGS}\"; pid=$(cat RUNNING_PID); echo \"JPro started with PID ${pid}\"; while kill -0 \"${pid}\" 2>/dev/null; do sleep 5; done"]
