FROM node:20-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, so
# they must be passed as build args (docker-compose forwards them - see
# the `args:` block under the frontend service in docker-compose.yml).
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_ORCHESTRA_API_URL
ARG NEXT_PUBLIC_ORCHESTRA_SOCKET_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/pipelines
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/pipelines
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_ORCHESTRA_API_URL=$NEXT_PUBLIC_ORCHESTRA_API_URL
ENV NEXT_PUBLIC_ORCHESTRA_SOCKET_URL=$NEXT_PUBLIC_ORCHESTRA_SOCKET_URL
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL

# Secret keys are only needed at runtime (Server Components / Route Handlers
# read them via process.env directly), so they come through as normal
# environment: entries in docker-compose.yml, not build args.
ARG CLERK_SECRET_KEY
ARG RAZORPAY_KEY_SECRET
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV RAZORPAY_KEY_SECRET=$RAZORPAY_KEY_SECRET

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/next.config.js ./
EXPOSE 3000
CMD ["npm", "start"]
