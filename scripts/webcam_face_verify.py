import sys
import json
import cv2
import torch
import numpy as np
import base64
import os
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1
from io import BytesIO

def process_image(image_data, model_path, confidence_threshold=0.8):
    """
    Process an image from base64 data, detect face, and verify against the model
    """
    try:
        # Set device
        device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
        
        # Load the face recognition model
        dataset = torch.load(model_path)
        dataset_embeddings = dataset['embeddings']
        dataset_names = dataset['names']
        
        # Initialize face detection model
        mtcnn = MTCNN(
            image_size=160, 
            margin=10,
            min_face_size=20,
            thresholds=[0.6, 0.7, 0.7],
            factor=0.709,
            post_process=True,
            device=device
        )
        
        # Initialize face embedding model
        resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

        # Decode base64 image data
        if image_data.startswith('data:image'):
            # Handle data URL format (e.g., "data:image/jpeg;base64,...")
            image_data = image_data.split(',')[1]
        
        # Decode the base64 string
        img_bytes = base64.b64decode(image_data)
        img_buffer = BytesIO(img_bytes)
        
        # Open the image with PIL
        img = Image.open(img_buffer).convert('RGB')
        
        # Use MTCNN to detect faces
        face, prob = mtcnn(img, return_prob=True)
        
        if face is None:
            conf_str = "0.00" if prob is None else f"{prob:.2f}"
            return {"matched": False, "error": f"No clear face detected in image (confidence: {conf_str})"}
        
        # Extract embedding for the detected face
        face_normalized = (face - face.mean()) / face.std()
        with torch.no_grad():
            embedding = resnet(face_normalized.unsqueeze(0)).detach().cpu().numpy()[0]
        
        # Find the closest match in the dataset
        closest_distance = float('inf')
        closest_idx = -1
        
        for i, ref_embedding in enumerate(dataset_embeddings):
            distance = np.linalg.norm(embedding - ref_embedding)
            if distance < closest_distance:
                closest_distance = distance
                closest_idx = i
        
        # Convert distance to similarity score (0-1 range)
        similarity = max(0, min(1, 1.0 - closest_distance / 2.0))
        
        if similarity >= confidence_threshold and closest_idx >= 0:
            # Get the registration number of the matched person
            registration = dataset_names[closest_idx]
            
            # If the name format is not already a registration number,
            # try to extract registration number from it
            if not (registration.startswith('S') or registration.isdigit()):
                if '_' in registration:
                    # Try to parse from format like "S12345_Name"
                    reg_parts = registration.split('_')
                    if reg_parts[0].startswith('S') or reg_parts[0].isdigit():
                        registration = reg_parts[0]
            
            return {
                "matched": True, 
                "regNo": registration,
                "confidence": float(similarity)
            }
        else:
            return {
                "matched": False, 
                "confidence": float(similarity),
                "threshold": confidence_threshold
            }
            
    except Exception as e:
        return {"error": str(e)}

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Required argument: model_path"}))
        sys.exit(1)
    
    # Read input from stdin (should be JSON with base64 image data)
    input_data = sys.stdin.read()
    try:
        request_data = json.loads(input_data)
        image_data = request_data.get('image')
        
        if not image_data:
            print(json.dumps({"error": "No image data provided"}))
            sys.exit(1)
        
        model_path = sys.argv[1]
        
        # Process the image
        result = process_image(image_data, model_path, 0.8)
        
        # Output JSON result
        print(json.dumps(result))
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()