# UIT-GO Development Terraform Setup

This directory contains a minimal Terraform configuration for deploying the UIT-GO microservices architecture to AWS for development purposes.

## Architecture Overview

The setup provisions:

- **VPC** with public subnets across 2 availability zones
- **Application Load Balancer** for external access
- **ECS Fargate Cluster** for containerized microservices
- **ElastiCache Redis** for caching
- **CloudWatch Log Groups** for centralized logging
- **Security Groups** with proper network isolation

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** installed (>= 1.0)
3. **Docker images** built and pushed to a container registry (ECR recommended)

## Quick Start

1. **Initialize Terraform:**

   ```bash
   cd terraform
   terraform init
   ```

2. **Review and modify variables:**
   Edit `terraform.tfvars` to match your requirements:

   ```hcl
   aws_region = "us-east-1"
   project_name = "uit-go-dev"
   clerk_secret_key = "your-actual-clerk-secret-key"
   ```

3. **Plan the deployment:**

   ```bash
   terraform plan
   ```

4. **Apply the configuration:**

   ```bash
   terraform apply
   ```

5. **Get outputs:**
   ```bash
   terraform output
   ```

## Configuration Files

- `main.tf` - Core infrastructure (VPC, networking, security groups)
- `ecs.tf` - ECS cluster, task definitions, and CloudWatch logs
- `variables.tf` - Input variables with defaults
- `outputs.tf` - Output values for reference
- `terraform.tfvars` - Environment-specific values

## Services Deployed

### API Gateway (Port 3000)

- External-facing REST API
- Routes requests to internal gRPC services
- Accessible via Application Load Balancer

### User Service (Port 50051)

- User management gRPC service
- Database connectivity for user data

### Driver Service (Port 50052)

- Driver management gRPC service
- Redis integration for geospatial operations
- Database connectivity for driver data

### Trip Service (Port 50053)

- Trip management gRPC service
- Database connectivity for trip data

### Redis Cache

- ElastiCache Redis cluster
- Used by driver service for geospatial queries

## Development Notes

- **Cost Optimization**: Uses `t3.micro` instances and minimal resources
- **Security**: Services communicate internally via service discovery
- **Logging**: 7-day log retention for development
- **Networking**: Public subnets only (no NAT Gateway) to reduce costs

## Environment Variables

Set these in your CI/CD or local environment:

```bash
export TF_VAR_clerk_secret_key="your-clerk-secret-key"
export AWS_REGION="us-east-1"
```

## Accessing Your Services

After deployment, your API Gateway will be accessible at:

```
http://<load-balancer-dns-name>/
```

Get the DNS name with:

```bash
terraform output load_balancer_dns_name
```

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

## Next Steps

1. Set up CI/CD pipeline to build and push Docker images
2. Configure Route 53 for custom domain
3. Add SSL certificate via AWS Certificate Manager
4. Set up monitoring and alerting
5. Consider migrating to private subnets with NAT Gateway for production

## Cost Estimation

This minimal setup should cost approximately $20-40/month for development use, including:

- ECS Fargate tasks
- Application Load Balancer
- ElastiCache Redis (t3.micro)
- CloudWatch logs
- Data transfer

## Security Considerations

- Uses security groups for network isolation
- ECS tasks run with minimal IAM permissions
- Redis only accessible from ECS tasks
- No public database access (configure RDS separately if needed)
