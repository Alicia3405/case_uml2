terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  description = "Región de AWS"
  type        = string
  default     = "us-east-1"
}

variable "key_name" {
  description = "Nombre del Key Pair SSH existente en AWS"
  type        = string
  default     = "case-studio-key"
}

variable "instance_type" {
  description = "Tipo de instancia EC2"
  type        = string
  default     = "t3.medium"
}

provider "aws" {
  region = var.aws_region
}

# Obtener la AMI más reciente de Ubuntu 24.04 LTS
data "aws_ami" "ubuntu" {
  most_recent = true
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  owners = ["099720109477"] # Canonical
}

# Grupo de Seguridad
resource "aws_security_group" "case_studio_sg" {
  name        = "case-studio-sg"
  description = "Security group para CASE Studio AI (SSH, HTTP, HTTPS, Web, Backend)"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP Nginx"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS SSL"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Web Frontend Directo"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Backend API Directo"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name    = "case-studio-sg"
    Account = "886595575652"
    Project = "CASE Studio AI"
  }
}

# Instancia EC2
resource "aws_instance" "case_studio" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = [aws_security_group.case_studio_sg.id]

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = file("${path.module}/user-data.sh")

  tags = {
    Name    = "case-studio-ec2"
    Account = "886595575652"
    Project = "CASE Studio AI"
  }
}

output "instance_id" {
  description = "ID de la instancia EC2"
  value       = aws_instance.case_studio.id
}

output "public_ip" {
  description = "IP Pública de la instancia EC2"
  value       = aws_instance.case_studio.public_ip
}

output "ssh_command" {
  description = "Comando SSH de conexión"
  value       = "ssh -i ${var.key_name}.pem ubuntu@${aws_instance.case_studio.public_ip}"
}

